#!/bin/sh
#
# Reissues the plugin's signing key and certificate for the JetBrains Marketplace.
#
# This script prints nothing secret: the key and the certificate go straight into files and into .env,
# while the screen gets safe metadata only (who the certificate was issued to, how long it is valid).
# ACC_PUBLISH_TOKEN is left alone: it was not compromised and lives its own life on the JetBrains account
# side.

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

if [ ! -f "$ENV_FILE" ]; then
  echo "No $ENV_FILE found - nothing to reissue." >&2
  exit 1
fi

OLD_TOKEN_LINE="$(grep '^export ACC_PUBLISH_TOKEN=' "$ENV_FILE")"
if [ -z "$OLD_TOKEN_LINE" ]; then
  echo "No ACC_PUBLISH_TOKEN in $ENV_FILE - the file does not look the way it was expected to." >&2
  exit 1
fi

PASSWORD="$(openssl rand -base64 32)"

openssl genpkey \
  -algorithm RSA -pkeyopt rsa_keygen_bits:4096 \
  -aes-256-cbc -pass "pass:$PASSWORD" \
  -out "$WORKDIR/private.pem" 2>"$WORKDIR/openssl.log"

openssl req \
  -key "$WORKDIR/private.pem" -passin "pass:$PASSWORD" \
  -new -x509 -days 365 \
  -subj "/CN=Max Zolotoi/OU=Amazing Claude Code/O=reclick.io" \
  -out "$WORKDIR/chain.crt" 2>>"$WORKDIR/openssl.log"

openssl pkcs8 \
  -topk8 -inform PEM -outform PEM \
  -in "$WORKDIR/private.pem" -passin "pass:$PASSWORD" \
  -out "$WORKDIR/private_pkcs8.pem" -passout "pass:$PASSWORD" 2>>"$WORKDIR/openssl.log"

{
  printf '%s\n' "# JetBrains Marketplace publishing secrets - do not commit; already in .gitignore."
  printf '%s\n' "# Before publishing: source .env"
  printf '%s\n' "$OLD_TOKEN_LINE"
  printf 'export ACC_PRIVATE_KEY_PASSWORD=%s\n' "$PASSWORD"
  printf "export ACC_CERTIFICATE_CHAIN='\n"
  cat "$WORKDIR/chain.crt"
  printf "'\n"
  printf "export ACC_PRIVATE_KEY='\n"
  cat "$WORKDIR/private_pkcs8.pem"
  printf "'\n"
} > "$ENV_FILE.new"

mv "$ENV_FILE.new" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Done. The new certificate:"
openssl x509 -in "$WORKDIR/chain.crt" -noout -subject -dates
