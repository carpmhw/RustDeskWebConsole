#!/bin/sh
# 單容器健康檢查：後端（既有 healthcheck CLI）與 nginx（本機 8000）都可用才回傳 0。
dotnet /app/RdWeb.Api.dll healthcheck >/dev/null 2>&1 || exit 1
curl --fail --silent --output /dev/null --max-time 5 http://127.0.0.1:8000/ || exit 1
