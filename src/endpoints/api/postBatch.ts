import { OpenAPIRoute, type OpenAPIRouteSchema } from "chanfana";
import { z } from "zod";
import {
    computeRemaining,
    generateSingleTotp,
    getErrorMessage,
} from "../../lib/totp";

export const DEFAULT_OFFSETS = [-30, 0, 30] as const;
export const MAX_OFFSETS = 10;

const batchRequestSchema = z.object({
    key: z.string().min(16, "Key must be at least 16 characters long."),
    digits: z.coerce.number().int().min(6, "Digits must be between 6 and 8.").max(8, "Digits must be between 6 and 8.").default(6),
    period: z.coerce.number().int().min(10, "Period must be between 10 and 60 seconds.").max(60, "Period must be between 10 and 60 seconds.").default(30),
    algorithm: z.enum(["SHA-1", "SHA-256", "SHA-512"]).default("SHA-1"),
    offsets: z
        .array(
            z.coerce
                .number()
                .int()
                .min(-3600, "Each offset must be between -3600 and 3600 seconds.")
                .max(3600, "Each offset must be between -3600 and 3600 seconds."),
        )
        .min(1, "At least one offset is required.")
        .max(MAX_OFFSETS, `At most ${MAX_OFFSETS} offsets are allowed.`)
        .default([...DEFAULT_OFFSETS]),
});

const batchResponseSchema = z.object({
    otps: z.array(
        z.object({
            offset: z.number(),
            otp: z.string(),
        }),
    ),
    remaining: z.number(),
});

export class GenerateTOTPBatchRoute extends OpenAPIRoute {
    schema: OpenAPIRouteSchema = {
        tags: ["TOTP"],
        summary: "Generate multiple TOTP codes in a single request",
        description:
            "Generates Time-based One-Time Passwords (TOTPs) for multiple time offsets (e.g. previous, current, next) based on a shared secret key, number of digits, time period, and algorithm. Consolidates what would otherwise be multiple GET /generate-totp calls into one round trip.",
        request: {
            body: {
                content: {
                    "application/json": {
                        schema: batchRequestSchema,
                    },
                },
            },
        },
        responses: {
            "200": {
                description: "Successfully generated TOTP batch",
                content: {
                    "application/json": {
                        schema: batchResponseSchema,
                    },
                },
            },
            "400": {
                description: "Invalid request parameters",
            },
            "500": {
                description: "Internal Server Error",
            },
        },
    };

    async handle(c) {
        let rawBody: unknown;
        try {
            rawBody = await c.req.json();
        } catch {
            return c.json(
                {
                    error: "Invalid request parameters",
                    details: "Request body must be valid JSON.",
                },
                400,
            );
        }

        const record =
            typeof rawBody === "object" && rawBody !== null
                ? (rawBody as Record<string, unknown>)
                : {};
        const rawKey = typeof record.key === "string" ? record.key : "";

        const parsedParams = batchRequestSchema.safeParse({
            ...record,
            key: rawKey.replace(/\s+/g, ""),
        });

        if (!parsedParams.success) {
            return c.json(
                {
                    error: "Invalid request parameters",
                    details: z.treeifyError(parsedParams.error),
                },
                400,
            );
        }

        try {
            const { key, digits, period, algorithm, offsets } = parsedParams.data;

            const otps = offsets.map((offset) => ({
                offset,
                otp: generateSingleTotp({
                    key,
                    digits,
                    period,
                    algorithm,
                    timeOffset: offset,
                }),
            }));

            const remaining = computeRemaining(period);

            return c.json({ otps, remaining });
        } catch (error) {
            const message = getErrorMessage(error);
            console.error("Error generating TOTP batch:", error);

            if (/secret|token|key|algorithm|digits|period|epoch|options/i.test(message)) {
                return c.json(
                    {
                        error: "Unable to generate TOTP with the provided parameters",
                        details: message,
                    },
                    400,
                );
            }

            return c.json({ error: "Internal Server Error" }, 500);
        }
    }
}
