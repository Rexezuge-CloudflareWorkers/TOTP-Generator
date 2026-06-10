import { OpenAPIRoute, type OpenAPIRouteSchema } from "chanfana";
import { z } from "zod";
import { generateSync, createGuardrails } from "otplib";

const requestSchema = z.object({
    key: z.string().min(16, "Key must be at least 16 characters long."),
    digits: z.coerce.number().int().min(6, "Digits must be between 6 and 8.").max(8, "Digits must be between 6 and 8."),
    period: z.coerce.number().int().min(10, "Period must be between 10 and 60 seconds.").max(60, "Period must be between 10 and 60 seconds."),
    algorithm: z.enum(["SHA-1", "SHA-256", "SHA-512"]).default("SHA-1"),
    timeOffset: z.coerce.number().int().min(-3600, "Time offset must be between -3600 and 3600 seconds.").max(3600, "Time offset must be between -3600 and 3600 seconds.").default(0),
});

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return "Unable to generate TOTP with the provided parameters.";
}

export class GenerateTOTPRoute extends OpenAPIRoute {
    schema: OpenAPIRouteSchema = {
        tags: ["TOTP"],
        summary: "Generate a TOTP code",
        description: "Generates a Time-based One-Time Password (TOTP) based on a provided secret key, number of digits, time period, and algorithm.",
        parameters: [
            {
                name: "key",
                in: "query",
                description: "Secret key for generating TOTP (at least 16 characters).",
                required: true,
                schema: { type: "string", minLength: 16 },
            },
            {
                name: "digits",
                in: "query",
                description: "Number of digits in the OTP (6 to 8).",
                required: false,
                schema: { type: "integer", minimum: 6, maximum: 8, default: 6 },
            },
            {
                name: "period",
                in: "query",
                description: "Time period in seconds for OTP expiration (10 to 60).",
                required: false,
                schema: { type: "integer", minimum: 10, maximum: 60, default: 30 },
            },
            {
                name: "algorithm",
                in: "query",
                description: "Hash algorithm to use for generating TOTP (e.g., SHA-1, SHA-256, SHA-512).",
                required: false,
                schema: { type: "string", enum: ["SHA-1", "SHA-256", "SHA-512"], default: "SHA-1" },
            },
            {
                name: "timeOffset",
                in: "query",
                description: "Time offset in seconds (e.g., -30 for OTP 30 seconds ago).",
                required: false,
                schema: { type: "integer", default: 0 },
            },
        ],
        responses: {
            "200": {
                description: "Successfully generated TOTP",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                otp: { type: "string" },
                                remaining: { type: "number" }
                            }
                        },
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
        const url = new URL(c.req.url);
        const rawKey = url.searchParams.get("key") ?? "";
        const cleanedKey = rawKey.replace(/\s+/g, "");

        const parsedParams = requestSchema.safeParse({
            key: cleanedKey,
            digits: url.searchParams.get("digits") ?? "6",
            period: url.searchParams.get("period") ?? "30",
            algorithm: url.searchParams.get("algorithm") ?? "SHA-1",
            timeOffset: url.searchParams.get("timeOffset") ?? "0",
        });

        if (!parsedParams.success) {
            return c.json({
                error: "Invalid request parameters",
                details: z.treeifyError(parsedParams.error),
            }, 400);
        }

        try {
            const { key, digits, period, algorithm, timeOffset } = parsedParams.data;

            const normalizedAlgorithm = algorithm.replace("-", "").toLowerCase() as "sha1" | "sha256" | "sha512";
            const adjustedEpoch = Math.floor((Date.now() + (timeOffset * 1000)) / 1000);

            const otp = generateSync({
                secret: key,
                digits,
                period,
                algorithm: normalizedAlgorithm,
                epoch: adjustedEpoch,
                guardrails: createGuardrails({ MIN_SECRET_BYTES: 1 }),
            });

            const currentTime = Math.floor(Date.now() / 1000);
            const remaining = period - (currentTime % period);

            return c.json({ otp, remaining });
        } catch (error) {
            const message = getErrorMessage(error);
            console.error("Error generating TOTP:", error);

            if (/secret|token|key|algorithm|digits|period|epoch|options/i.test(message)) {
                return c.json({
                    error: "Unable to generate TOTP with the provided parameters",
                    details: message,
                }, 400);
            }

            return c.json({ error: "Internal Server Error" }, 500);
        }
    }
}
