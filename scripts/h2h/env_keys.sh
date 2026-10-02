#!/bin/zsh
# Builds .env.keys (chmod 600, git-ignored via .env*) from macOS Keychain. Never prints a key.
#   zsh scripts/h2h/env_keys.sh && set -a && . ./.env.keys && set +a
cd "${0:A:h}/../.." || exit 1
umask 077
kc() { security find-generic-password -s "$1" -w 2>/dev/null; }
{
  for pair in KEENABLE_API_KEY:keenable-api OPENROUTER_API_KEY:hackday-openrouter-api \
              TAVILY_API_KEY:keenable-h2h-tavily EXA_API_KEY:keenable-h2h-exa PARALLEL_API_KEY:keenable-h2h-parallel \
              LINKUP_API_KEY:keenable-h2h-linkup FIRECRAWL_API_KEY:keenable-h2h-firecrawl SERPAPI_API_KEY:keenable-h2h-serpapi \
              BRAVE_API_KEY:keenable-h2h-brave PERPLEXITY_API_KEY:keenable-h2h-perplexity \
              SERPER_API_KEY:keenable-h2h-serper YOUCOM_API_KEY:keenable-h2h-youcom VALYU_API_KEY:keenable-h2h-valyu \
              JINA_API_KEY:keenable-h2h-jina SEARCHAPI_API_KEY:keenable-h2h-searchapi \
              OPENREWARD_API_KEY:keenable-h2h-openreward; do
    var=${pair%%:*}; svc=${pair#*:}; val=$(kc "$svc")
    [[ -n "$val" ]] && print -r -- "$var=$val"
  done
} > .env.keys
chmod 600 .env.keys
print -r -- "wrote .env.keys with: $(cut -d= -f1 .env.keys | tr '\n' ' ')"
