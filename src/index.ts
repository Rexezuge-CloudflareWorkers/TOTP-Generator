import { fromHono } from "chanfana";
import { GenerateTOTPRoute } from "endpoints/api/get";
import { Hono } from "hono";

// Start a Hono app
const app = new Hono();

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/docs",
});

// Register OpenAPI endpoints
openapi.get('/generate-totp', GenerateTOTPRoute);

// Export the Hono app
export default app;
