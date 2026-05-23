set omniUrl to "http://127.0.0.1:5173/?mode=omni"

try
  do shell script "uid=$(/usr/bin/id -u); home=$HOME; /bin/launchctl bootstrap gui/$uid \"$home/Library/LaunchAgents/com.oagent.omni.server.plist\" >/dev/null 2>&1 || true; /bin/launchctl bootstrap gui/$uid \"$home/Library/LaunchAgents/com.oagent.omni.client.plist\" >/dev/null 2>&1 || true; /bin/launchctl kickstart -k gui/$uid/com.oagent.omni.server >/dev/null 2>&1 || true; /bin/launchctl kickstart -k gui/$uid/com.oagent.omni.client >/dev/null 2>&1 || true; i=0; while [ $i -lt 60 ]; do /usr/bin/curl -fsS http://127.0.0.1:8788/api/health >/dev/null 2>&1 && /usr/bin/curl -fsSI 'http://127.0.0.1:5173/?mode=omni' >/dev/null 2>&1 && exit 0; i=$((i+1)); /bin/sleep 0.5; done; exit 0"
end try

try
  do shell script "open -na 'Google Chrome' --args --app=" & quoted form of omniUrl
on error
  open location omniUrl
end try
