import {ConnectionConfig} from 'tedious'

export interface Adapter {
  query(...params: any[]): Promise<any[]>
  json(...params: any[]): Promise<any[]>
  close(): void
}

export interface Query {
  text: string
  values: any[]
}

export interface Migration {
  id: number
  name: string
  up: (db: Adapter) => any
  down: (db: Adapter) => any
}

export type IConfig = ConnectionConfig | string

export * from './connection'
export * from './migrations'
export * from './pool'
