#!/usr/bin/env fish

set DIR (cd (dirname (status -f)); and pwd)
source $DIR/common.fish

function setupASDF
  setupASDFTool nodejs lts
end

function main
  setupASDF &
  npm -g i npm@latest &
  wait
  finishInit
end

main $argv
