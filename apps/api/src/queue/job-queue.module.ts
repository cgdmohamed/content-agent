import { Global, Module, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { loadEnv } from "@content-agent/config";

export class JobQueueService implements OnModuleDestroy {
  private readonly connection = new IORedis(loadEnv().REDIS_URL, {
    maxRetriesPerRequest: null
  });
  private readonly queues = new Map<string, Queue>();

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    await this.connection.quit();
  }

  async enqueue(queueName: string, jobName: string, data: Record<string, unknown>, jobId: string, delayMs = 0): Promise<string> {
    const queue = this.queue(queueName);
    const job = await queue.add(jobName, data, {
      jobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      delay: Math.max(0, Math.trunc(delayMs)),
      removeOnComplete: false,
      removeOnFail: false
    });
    return String(job.id);
  }

  async cancelQueuedJob(queueName: string, jobId: string): Promise<void> {
    const job = await this.queue(queueName).getJob(jobId);
    if (!job) return;
    const state = await job.getState();
    if (!["waiting", "delayed", "prioritized"].includes(state)) {
      throw new Error("لا يمكن إلغاء مهمة بدأت بالفعل.");
    }
    await job.remove();
  }

  private queue(name: string): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;
    const created = new Queue(name, { connection: this.connection });
    this.queues.set(name, created);
    return created;
  }
}

@Global()
@Module({
  providers: [JobQueueService],
  exports: [JobQueueService]
})
export class JobQueueModule {}
