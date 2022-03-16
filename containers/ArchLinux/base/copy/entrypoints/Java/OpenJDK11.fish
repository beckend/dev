#!/usr/bin/env fish

set DIR (cd (dirname (status -f)); and pwd)
source $DIR/../common.fish

function main
  setupASDFTool java 'openjdk-11.0.2'
  finishInit
end

main $argv
