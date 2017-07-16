#!/usr/bin/env node
import * as path from 'path'
import * as fs from 'fs'
import * as program from 'commander'
import 'ts-node/register'
import {Migrations} from './migrations'

var pkg = require('../package.json')
var migrations: Migrations

const init = function() {
  let connection = program.connection || process.env.DATABASE_URL || 'mssql://sa@localhost'
  let dir = program.dir || path.join(process.cwd(), 'src', 'migrations')

  try {
    fs.statSync(dir)
  } catch(err) {
    console.error(`Error: Migrations directory "${dir}" does not exist`)
    process.exit(1)
  }

  migrations = new Migrations(connection, dir)
}

process.on('unhandledRejection', (err: Error) => {
  console.error('Error: ' + err.message)
  console.log()
  console.log(err)
  process.exit(1)
})

program
  .version(pkg.version)
  .option('-c, --connection <connection>', 'Connection string, default to DATABASE_URL')
  .option('-d, --dir <dir>', 'Migrations directory, defaults to src/migrations')

program
  .command('create <name>')
  .description('Create new migration')
  .action(async function(name) {
    init()
    let file = await migrations.create(name)
    console.log(`Created ${file}`)
  })

program
  .command('list')
  .description('List available migrations')
  .action(async function() {
    init()
    let list = await migrations.list()
    let current = await migrations.current()

    if (list.length) {
      list.forEach(m => {
        console.log(`* ${m.id}-${m.name} ${m.id === current ? '[current]' : ''}`)
      })
    } else {
      console.log('No migrations available')
    }

    await migrations.db.close()
  })

program
  .command('up')
  .description('Migrate up one version')
  .action(async function() {
    init()
    let list = await migrations.list()

    if (list.length) {
      let id = await migrations.up()
      let current = list.find(m => m.id === id)
      
      console.log(current ? `Currently at ${current.id}-${current.name}` : 'Currently at 0')
      await migrations.db.close()
    } else {
      console.log('No migrations available')
    }
  })

program
  .command('down')
  .description('Migrate down one version')
  .action(async function() {
    init()
    let list = await migrations.list()

    if (list.length) {
      let id = await migrations.down()
      let current = list.find(m => m.id === id)

      console.log(current ? `Currently at ${current.id}-${current.name}` : 'Currently at 0')
      await migrations.db.close()
    } else {
      console.log('No migrations available')
    }
  })

program
  .command('latest')
  .description('Migrate to latest version')
  .action(async function() {
    init()
    let list = await migrations.list()

    if (list.length) {
      let id = await migrations.latest()
      let current = list.find(m => m.id === id)
      
      console.log(current ? `Currently at ${current.id}-${current.name}` : 'Currently at 0')
      await migrations.db.close()
    } else {
      console.log('No migrations available')
    }
  })

program.parse(process.argv)

if (!program.args.length) {
  program.help()
}
