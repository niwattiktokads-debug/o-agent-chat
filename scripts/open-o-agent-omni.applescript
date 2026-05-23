set omniUrl to "http://127.0.0.1:5173/?mode=omni"

try
  do shell script "open -na 'Google Chrome' --args --app=" & quoted form of omniUrl
on error
  open location omniUrl
end try
