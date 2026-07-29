#!/usr/bin/env node
// Generate a VAPID key pair for web push. Run once, then paste the output into
// your environment (.env.local for dev, project settings for prod):
//
//   node scripts/gen-vapid.mjs
//
// NEVER commit the private key.
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("# Add these to your environment (do NOT commit the private key):");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log("VAPID_SUBJECT=mailto:you@example.org");
console.log("# Also set a secret for the alert cron:");
console.log("CRON_SECRET=" + Buffer.from(webpush.generateVAPIDKeys().privateKey).toString("base64url").slice(0, 32));
