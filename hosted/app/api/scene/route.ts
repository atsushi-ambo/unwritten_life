import { hostedAPI } from "../../hosted-api";
import { getChatGPTUser } from "../../chatgpt-auth";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return hostedAPI().scene(request, await getChatGPTUser());
}
