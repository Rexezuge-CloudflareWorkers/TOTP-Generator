import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { totp } from "otplib";

export class GenerateTOTPRoute extends OpenAPIRoute {
    schema = {
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
        ],
        responses: {
            "200": {
                description: "Successfully generated TOTP",
                content: {
                    "application/json": {
                        schema: z.object({
                            otp: z.string(),
                            remaining: z.number(),
                        }),
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
        try {
            const url = new URL(c.req.url);

            // 解析并校验参数
            const schema = z.object({
                key: z.string().min(16, "Key must be at least 16 characters long."),
                digits: z.string().regex(/^\d+$/).default("6"),
                period: z.string().regex(/^\d+$/).default("30"),
                algorithm: z.string().regex(/^(SHA-1|SHA-256|SHA-512)$/).default("SHA-1"),
            });

            const parsedParams = schema.safeParse({
                key: url.searchParams.get("key"),
                digits: url.searchParams.get("digits") ?? "6",
                period: url.searchParams.get("period") ?? "30",
                algorithm: url.searchParams.get("algorithm") ?? "SHA-1",
            });

            if (!parsedParams.success) {
                return c.json({ error: "Invalid request parameters", details: parsedParams.error.format() }, 400);
            }

            const { key, digits, period, algorithm } = parsedParams.data;
            const digitsNum = parseInt(digits, 10);
            const periodNum = parseInt(period, 10);

            // 将算法名称转换为 otplib 支持的格式（去掉连字符并转换为小写）
            const normalizedAlgorithm = algorithm.replace("-", "").toLowerCase() as "sha1" | "sha256" | "sha512";

            // 设置 TOTP 选项
            totp.options = {
                digits: digitsNum,
                step: periodNum,
                algorithm: normalizedAlgorithm
            };

            // 生成 TOTP
            const otp = totp.generate(key);

            // 计算剩余时间
            const currentTime = Math.floor(Date.now() / 1000);
            const remaining = periodNum - (currentTime % periodNum);

            return c.json({ otp, remaining });
        } catch (error) {
            console.error("Error generating TOTP:", error);
            return c.json({ error: "Internal Server Error" }, 500);
        }
    }
}
