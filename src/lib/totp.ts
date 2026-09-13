import { generateSync, createGuardrails } from "otplib";

export type TotpAlgorithm = "SHA-1" | "SHA-256" | "SHA-512";

export type GenerateTotpOptions = {
	key: string;
	digits: number;
	period: number;
	algorithm: TotpAlgorithm;
	timeOffset: number;
};

export function generateSingleTotp({
	key,
	digits,
	period,
	algorithm,
	timeOffset,
}: GenerateTotpOptions): string {
	const normalizedAlgorithm = algorithm.replace("-", "").toLowerCase() as
		| "sha1"
		| "sha256"
		| "sha512";
	const adjustedEpoch = Math.floor((Date.now() + timeOffset * 1000) / 1000);

	return generateSync({
		secret: key,
		digits,
		period,
		algorithm: normalizedAlgorithm,
		epoch: adjustedEpoch,
		guardrails: createGuardrails({ MIN_SECRET_BYTES: 1 }),
	});
}

export function computeRemaining(period: number): number {
	const currentTime = Math.floor(Date.now() / 1000);
	return period - (currentTime % period);
}

export function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return "Unable to generate TOTP with the provided parameters.";
}
