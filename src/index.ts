import { fromHono } from "chanfana";
import { GenerateTOTPRoute } from "./endpoints/api/get";
import { Hono } from "hono";
import { cors } from "hono/cors";

// Start a Hono app
const app = new Hono();

// Add CORS middleware
app.use('*', cors());

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/docs",
});

// Register OpenAPI endpoints
openapi.get('/generate-totp', GenerateTOTPRoute);

// Export the Hono app
export default openapi;
