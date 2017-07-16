import * as path from 'path'
import * as fs from 'fs'
import {Migration, IConfig, Connection} from '.'

export class Migrations {
  public db: Connection
  public dir: string

  constructor(config: IConfig, dir: string) {
    this.db = new Connection(config)
    this.dir = dir
  }

  /**
   * Create new migration file
   */
  create(name: string) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error('Migration name should only contain [a-zA-Z0-9_-]')
    }

    let time = (new Date).toISOString().replace(/[-:T]/g, '').slice(0, 14)
    let file = path.join(this.dir, `${time}-${name}.ts`)
    let tmpl = [
      "import {Connection} from 'tsql'\n",
      "export async function up(db: Connection) {\n}\n",
      "export async function down(db: Connection) {\n}\n",
    ].join("\n")

    return new Promise<string>(function(resolve, reject) {
      fs.writeFile(file, tmpl, function(err) {
        err ? reject(err) : resolve(file)
      })
    })
  }

  /**
   * Get current migration
   */
  async current() {
    let rows = await this.db.query`
      if not exists (select * from sys.tables where name='migrations') begin
        create table [migrations] (id varchar(14) not null)
      end
      select id from migrations
    `

    return rows.length ? Number(rows[0].id) : 0
  }

  /**
   * Set current migration
   */
  async migrate(id: number, fn: ((db: Connection) => any)[]) {
    let t = (new Date).getTime()

    await this.db.begin(`migration_${t}`)
    await this.db.query`truncate table migrations`
    await this.db.query`insert into migrations values(${String(id)})`

    for (let i = 0; i < fn.length; i++) {
      await fn[i](this.db)
    }

    await this.db.commit()
  }

  /**
   * List available migrations
   */
  async list() {
    return new Promise<Migration[]>((resolve, reject) => {
      fs.readdir(this.dir, (err, files) => {
        if (err) return reject(err)

        let migrations = files
          .filter(filename => /^\d{14}-[a-zA-Z0-9_-]+\.{js|ts}$/)
          .map(filename => {
            let fn = require(path.join(this.dir, filename))
            let id = Number(filename.slice(0, 14))
            let name = path.basename(filename, path.extname(filename)).slice(15)

            return <Migration>{
              id,
              name,
              up: fn.up,
              down: fn.down
            }
          })
          .sort((a, b) => a.id > b.id ? 1 : -1)

        resolve(migrations)
      })
    })
  }

  /**
   * Migrate up
   */
  async up() {
    let current = await this.current()
    let migrations = await this.list()
    let next = migrations.find(m => m.id > current)

    if (next) {
      await this.migrate(next.id, [next.up])
    }

    return next ? next.id : current
  }

  /**
   * Migrate down
   */
  async down() {
    let current = await this.current()
    let migrations = await this.list()

    let from = migrations.find(m => m.id === current)
    let to = migrations.reverse().find(m => m.id < current)

    if (from) {
      await this.migrate(to ? to.id : 0, [from.down])
    }

    return from && to ? to.id : 0
  }

  /**
   * Migrate to latest
   */
  async latest() {
    let current = await this.current()
    let migrations = await this.list()

    let next = migrations.filter(m => m.id > current)
    let final = next[next.length-1]

    if (final) {
      let fns = next.map(m => m.up)
      await this.migrate(final.id, fns)
    }

    return final ? final.id : current
  }
}
