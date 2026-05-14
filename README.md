# TOTP-Generator

A simple web-based TOTP (Time-based One-Time Password) generator. Generate secure verification codes instantly in your browser.

## Live Demo

Visit: https://totp-generator.rexezuge.com/

## Features

- **Instant TOTP generation** - Generate 6-8 digit codes in seconds
- **Customizable settings** - Adjust digits, period, and algorithm
- **Time offset support** - Generate codes for different time scenarios
- **OpenAPI compatible** - Programmatic access via REST API

## Quick Start

### Web Interface

1. Open https://totp-generator.rexezuge.com/
2. Enter your secret key (minimum 16 characters)
3. Adjust optional settings (digits, period, algorithm)
4. Copy your generated code

### API Usage

Generate codes programmatically:

```
GET /generate-totp?key=YOUR_SECRET_KEY&digits=6&period=30&algorithm=SHA-1
```

**Parameters:**
| Parameter | Description | Default |
|-----------|-------------|---------|
| `key` | Secret key (required, min 16 chars) | - |
| `digits` | Number of digits (6-8) | 6 |
| `period` | Code validity in seconds (10-60) | 30 |
| `algorithm` | Hash algorithm (SHA-1, SHA-256, SHA-512) | SHA-1 |
| `timeOffset` | Time offset in seconds (-3600 to 3600) | 0 |

**Response:**
```json
{
  "otp": "123456",
  "remaining": 25
}
```

## License

MIT