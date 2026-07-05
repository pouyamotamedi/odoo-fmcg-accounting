$a = @'
{"jsonrpc":"2.0","id":1,"method":"call","params":{"db":"fmcg_shop","login":"admin","password":"admin"}}
'@
$null = Invoke-WebRequest 'http://localhost:8069/web/session/authenticate' -Method POST -ContentType 'application/json' -Body $a -UseBasicParsing -SessionVariable ws

# Get all accounts
$b = @'
{"jsonrpc":"2.0","id":2,"method":"call","params":{"model":"account.account","method":"search_read","args":[[]],"kwargs":{"fields":["name","code","account_type"],"limit":0,"order":"code asc"}}}
'@
$r = Invoke-WebRequest 'http://localhost:8069/web/dataset/call_kw' -Method POST -ContentType 'application/json' -Body $b -UseBasicParsing -WebSession $ws
$accounts = ($r.Content | ConvertFrom-Json).result
Write-Host "=== ALL ACCOUNTS ==="
foreach ($acc in $accounts) {
    Write-Host "  $($acc.id) | $($acc.code) | $($acc.name) | $($acc.account_type)"
}
