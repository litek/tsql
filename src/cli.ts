#!/usr/bin/env node
import * as path from 'path'
import * as program from 'commander'
import 'ts-node/register'
import {Migrations} from './migrations'

const pkg = require('../package.json')
const defaults = {
  dir: path.join(process.cwd(), 'src', 'migrations'),
  connection: process.env.DATABASE_URL || 'mssql://sa@localhost'
}

program
  .version(pkg.version)
  .option('-d, --dir <dir>', 'Migrations directory, defaults to src/migrations', defaults.dir)
  .option('-c, --connection <connection>', 'Connection string, default to DATABASE_URL', defaults.connection)

program
  .command('create <name>')
  .description('Create new migration')
  .action(async function(name) {
    let migrations = new Migrations(program.connection, program.dir)
    let file = await migrations.create(name)
    console.log(`Created ${file}`)
  })

program
  .command('list')
  .description('List available migrations')
  .action(async function(arg) {
    let migrations = new Migrations(program.connection, program.dir)
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
  .action(async function(arg) {
    let migrations = new Migrations(program.connection, program.dir)
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
  .action(async function(arg) {
    let migrations = new Migrations(program.connection, program.dir)
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
  .action(async function(arg) {
    let migrations = new Migrations(program.connection, program.dir)
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
