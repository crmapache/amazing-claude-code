#!/bin/sh
#
# Перевыпуск ключа и сертификата подписи плагина для JetBrains Marketplace.
#
# Ничего секретное этот скрипт не печатает: ключ и сертификат уходят прямо в
# файлы и в .env, а на экран — только безопасные метаданные (кому выдан
# сертификат, до какого числа действует). ACC_PUBLISH_TOKEN не трогается: он
# не был скомпрометирован и живёт своей жизнью на стороне JetBrains-аккаунта.

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

if [ ! -f "$ENV_FILE" ]; then
  echo "Не нашёл $ENV_FILE — нечего перевыпускать." >&2
  exit 1
fi

OLD_TOKEN_LINE="$(grep '^export ACC_PUBLISH_TOKEN=' "$ENV_FILE")"
if [ -z "$OLD_TOKEN_LINE" ]; then
  echo "Не нашёл ACC_PUBLISH_TOKEN в $ENV_FILE — файл выглядит не так, как ожидалось." >&2
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
  printf '%s\n' "# Секреты публикации на JetBrains Marketplace — не коммитить, в .gitignore уже добавлено."
  printf '%s\n' "# Перед публикацией: source .env"
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

echo "Готово. Новый сертификат:"
openssl x509 -in "$WORKDIR/chain.crt" -noout -subject -dates
