import type { Context } from "hono";
import { HTML_TEMPLATE } from "../generated-src/generated";

export function HomePageRoute(cxt: Context): Response {
    const html: string = HTML_TEMPLATE;
    return cxt.html(html);
}
