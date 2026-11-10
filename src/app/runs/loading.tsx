import { RunsPage } from "@/components/views/runs";

/** Shown at once on navigation (Next prefetches it): the same page, with placeholders where the data goes. */
export default function Loading() {
  return <RunsPage loading />;
}
