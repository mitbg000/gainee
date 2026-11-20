# Sourced by other scripts: make node/npm/pm2 available even in a non-login SSH shell.
# aaPanel installs Node.js under /www/server/nodejs/<version>/bin.
# Always prefer aaPanel's newest Node: a distro Node (e.g. v12) or a pm2 symlink may already be on PATH.
d=$(ls -d /www/server/nodejs/v*/bin 2>/dev/null | sort -V | tail -1)
[ -n "$d" ] && export PATH="$d:$PATH"
command -v node >/dev/null 2>&1 || { echo "Node.js not found. Install Node 20+ in aaPanel (App Store → Node.js version manager)."; exit 1; }
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || { echo "Node $NODE_MAJOR found – Gainee needs Node 20.6+ (22 LTS recommended)."; exit 1; }
