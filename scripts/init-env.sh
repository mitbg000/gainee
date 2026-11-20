#!/usr/bin/env bash
# Create .env on first install: generates secrets and asks for the MySQL details and login password.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_node.sh

if [ -f .env ]; then
  read -rp ".env already exists. Overwrite? (y/N) " ok
  [ "${ok:-N}" = "y" ] || exit 0
fi

echo "MySQL database (create it first in aaPanel → Databases, charset utf8mb4)"
read -rp "  Database name [gainee]: " DB_NAME; DB_NAME=${DB_NAME:-gainee}
read -rp "  Database user [$DB_NAME]: " DB_USER; DB_USER=${DB_USER:-$DB_NAME}
read -rsp "  Database password: " DB_PASS; echo
read -rp "  Host [127.0.0.1]: " DB_HOST; DB_HOST=${DB_HOST:-127.0.0.1}
read -rp "  Port [3306]: " DB_PORT; DB_PORT=${DB_PORT:-3306}
read -rp "App port (must be free) [3000]: " APP_PORT; APP_PORT=${APP_PORT:-3000}
read -rp "Default language (en/vi) [vi]: " LOCALE; LOCALE=${LOCALE:-vi}
read -rp "Upload folder [/www/wwwroot/gainee-data/uploads]: " UPLOADS; UPLOADS=${UPLOADS:-/www/wwwroot/gainee-data/uploads}

read -rp "Login username for the web app [admin]: " APP_USER; APP_USER=${APP_USER:-admin}
while true; do
  read -rsp "Login password for the web app (min 8 chars): " PW; echo
  read -rsp "Repeat: " PW2; echo
  [ "$PW" = "$PW2" ] && [ ${#PW} -ge 8 ] && break
  echo "Passwords do not match or are too short – try again."
done

ENC_DB_PASS=$(node -p 'encodeURIComponent(process.argv[1])' "$DB_PASS")
HASH=$(PW="$PW" node -e 'const c=require("crypto");const s=c.randomBytes(16);console.log("scrypt:"+s.toString("hex")+":"+c.scryptSync(process.env.PW,s,64).toString("hex"))')

cp .env.example .env
set_kv() { node -e '
  const fs=require("fs");const [k,v]=process.argv.slice(1);
  const t=fs.readFileSync(".env","utf8").replace(new RegExp("^"+k+"=.*$","m"),()=>k+"="+v);
  fs.writeFileSync(".env",t);' "$1" "$2"; }
set_kv PORT "$APP_PORT"
set_kv DEFAULT_LOCALE "$LOCALE"
set_kv DATABASE_URL "mysql://$DB_USER:$ENC_DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME"
set_kv APP_USERNAME "$APP_USER"
set_kv APP_PASSWORD_HASH "$HASH"
set_kv SESSION_SECRET "$(node -p 'require("crypto").randomBytes(32).toString("hex")')"
set_kv ENCRYPTION_KEY "$(node -p 'require("crypto").randomBytes(32).toString("base64")')"
set_kv UPLOAD_DIR "$UPLOADS"
chmod 600 .env
mkdir -p "$UPLOADS"

echo
echo "✅ .env created."
echo "⚠️  Save a copy of ENCRYPTION_KEY somewhere safe – without it, stored AI keys cannot be decrypted."
