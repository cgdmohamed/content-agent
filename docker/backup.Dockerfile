# Backup sidecar: pg_dump (same major version as the database), age encryption, AWS CLI for S3-compatible storage.
FROM postgres:16-alpine
RUN apk add --no-cache age aws-cli curl
COPY docker/backup/ /opt/backup/
RUN chmod +x /opt/backup/*.sh
ENV BACKUP_DIR=/backups
VOLUME ["/backups"]
HEALTHCHECK --interval=1h --timeout=10s --start-period=10m --retries=1 CMD ["/opt/backup/healthcheck.sh"]
ENTRYPOINT ["/opt/backup/entrypoint.sh"]
