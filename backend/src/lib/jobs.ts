const activeJobs = new Set<string>();

export function queuePreviewJob(
  jobId: string,
  task: () => Promise<void>,
  onError?: (error: unknown) => void,
) {
  activeJobs.add(jobId);
  void task()
    .catch((error) => {
      onError?.(error);
      if (!onError) {
        console.error("Preview job crashed", { jobId, error });
      }
    })
    .finally(() => {
      activeJobs.delete(jobId);
    });
}

export function isPreviewJobActive(jobId: string): boolean {
  return activeJobs.has(jobId);
}
