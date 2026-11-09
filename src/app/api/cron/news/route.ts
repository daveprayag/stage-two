import { runNews } from "@/engine/pipeline";
import { handleJob } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = (req: Request) => handleJob(req, runNews);
