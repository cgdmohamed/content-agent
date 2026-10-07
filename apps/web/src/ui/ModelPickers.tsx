import type { ReactElement } from "react";
import type { ModelOperationDto, ModelRefDto, ModelSpecDto, OperationModelsDto } from "../api/client";

export function modelKeyOf(ref: ModelRefDto): string {
  return `${ref.provider}:${ref.model}`;
}

export function modelOptionLabel(spec: ModelSpecDto): string {
  // Text prices are USD per million tokens (input/output); image prices are per image.
  const price = spec.kind === "image" ? `$${spec.imageUsd ?? "؟"}/صورة` : `$${spec.inputPerM ?? "؟"}/$${spec.outputPerM ?? "؟"}`;
  const notes = [spec.estimated ? "تقديري" : null, spec.providerConfigured ? null : "بلا مفتاح"].filter(Boolean).join("، ");
  return `${spec.label} · ${price}${notes ? ` (${notes})` : ""}`;
}

const fieldName = (prefix: string, operation: string, index: number): string => `${prefix}:${operation}:${index}`;

/** One row per operation: a primary model and an optional fallback. Read the result with readOperationModels(). */
export function OperationModelPickers(props: {
  prefix: string;
  operations: ModelOperationDto[];
  catalog: ModelSpecDto[];
  value: OperationModelsDto;
  /** Label of the empty option, e.g. "افتراضي النظام". */
  emptyLabel: string;
}): ReactElement {
  const selectClass = "w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 py-2 text-sm";
  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <div className="hidden grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] gap-3 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 md:grid">
        <span>العملية</span>
        <span>الموديل الأساسي</span>
        <span>بديل عند الفشل</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {props.operations.map((operation) => {
          const options = props.catalog.filter((spec) => spec.kind === operation.kind);
          const chain = props.value[operation.key] ?? [];
          return (
            <li key={operation.key} className="grid gap-2 px-3 py-2.5 md:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-3">
              <span className="text-sm font-medium text-slate-700">{operation.label}</span>
              {[0, 1].map((index) => (
                <select
                  key={index}
                  name={fieldName(props.prefix, operation.key, index)}
                  aria-label={`${operation.label}: ${index === 0 ? "الموديل الأساسي" : "بديل عند الفشل"}`}
                  defaultValue={chain[index] ? modelKeyOf(chain[index]!) : ""}
                  className={selectClass}
                >
                  <option value="">{index === 0 ? props.emptyLabel : "بدون بديل"}</option>
                  {options.map((spec) => (
                    <option key={modelKeyOf(spec)} value={modelKeyOf(spec)}>{modelOptionLabel(spec)}</option>
                  ))}
                </select>
              ))}
            </li>
          );
        })}
      </ul>
      <p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">الأسعار بالدولار لكل مليون توكن (دخل/خرج)، وللصور لكل صورة.</p>
    </div>
  );
}

export function readOperationModels(data: FormData, prefix: string, operations: ModelOperationDto[], catalog: ModelSpecDto[]): OperationModelsDto {
  const result: OperationModelsDto = {};
  for (const operation of operations) {
    const chain: ModelRefDto[] = [];
    for (const index of [0, 1]) {
      const key = String(data.get(fieldName(prefix, operation.key, index)) ?? "");
      const spec = catalog.find((item) => modelKeyOf(item) === key);
      if (spec && !chain.some((ref) => modelKeyOf(ref) === key)) chain.push({ provider: spec.provider, model: spec.model });
    }
    if (chain.length > 0) result[operation.key] = chain;
  }
  return result;
}

/** Checkbox list of models a site may use. An empty selection means every model is allowed. */
export function AllowedModelsPicker(props: { name: string; catalog: ModelSpecDto[]; value: string[] }): ReactElement {
  return (
    <fieldset className="rounded-md border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold text-slate-700">الموديلات المسموحة لهذا الموقع</legend>
      <p className="text-xs text-slate-500">لو لم تحدد أي موديل فكل الموديلات متاحة. عند التحديد لن يستخدم الموقع إلا الموديلات المحددة.</p>
      <div className="mt-2 grid gap-1 md:grid-cols-2">
        {props.catalog.map((spec) => (
          <label key={modelKeyOf(spec)} className="flex items-start gap-2 text-sm">
            <input type="checkbox" name={props.name} value={modelKeyOf(spec)} defaultChecked={props.value.includes(modelKeyOf(spec))} className="mt-1 h-4 w-4" />
            <span>{modelOptionLabel(spec)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
