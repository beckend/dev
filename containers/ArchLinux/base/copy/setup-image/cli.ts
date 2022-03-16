#!/usr/bin/env -S deno run -q -A --unstable --no-check
import { Command } from 'https://deno.land/x/cliffy@v0.20.1/command/command.ts'
import { CompletionsCommand } from 'https://deno.land/x/cliffy@v0.20.1/command/completions/mod.ts'

import {
  Logger,
  Level as LoggerLevel,
} from 'https://raw.githubusercontent.com/beckend/deno-applications/main/src/modules/logger/mod.ts'

import { ICommandCommonOptions, Script } from './script.ts'

export interface ICLIOptions {
  readonly userName: ICommandCommonOptions['user'] ['name']
}

try {
  const getters = {
    commandCommon: () =>
      new Command()
        // this is specific for this option
        .allowEmpty(false),

    logger: () =>
      Logger.New({
        levelLog: LoggerLevel.Debug,
        name: 'setup-handler',
      }),
  }

  const logger = await getters.logger()
  logger.info('start')

  await getters
    .commandCommon()
    .help({
      types: true,
      hints: true,
    })

    .command(
      'setup',
      getters
        .commandCommon()
        .option<{ userName: string }>(
          '--userName [value:string]',
          'container main username',
          {
            required: true,
          },
        )
        .action(async (options: ICLIOptions) => {
          const instance = await new Script({
            user: {
              name: options.userName,
            },
          })

          return instance.main()
        })
        .description('tasks based on events'),
    )

    .command('completions', new CompletionsCommand())
    .parse(Deno.args)

  logger.info('end')
} catch (err) {
  console.error(err)
  Deno.exit(1)
}

