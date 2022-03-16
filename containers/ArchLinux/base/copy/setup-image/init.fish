#!/usr/bin/env fish

set DIR (cd (dirname (status -f)); and pwd)

function checkRequiredArgs
    set -l ENV_NAME $argv[1]

    if test -z "$$ENV_NAME"
        echo "$ENV_NAME has not been set" 1>&2
        exit 1
    end
end

function main
    set -x DENO_DIR /tmp/deno-cache

    "$DIR"/cli.ts setup \
        --userName="$USER_NAME"

    rm -rf /tmp/*
    cd /
    rm -rf "$DIR"
end

checkRequiredArgs USER_NAME

main $argv
