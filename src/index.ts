import {ConnectionConfig} from 'tedious'

export interface IAdapter {
  query<T>(text: string, params: {}): Promise<T[]>
  query<T>(text: TemplateStringsArray, ...params: {}[]): Promise<T[]>
  query<T>(query: IQuery): Promise<T[]>
  json<T>(text: string, params: {}): Promise<T[]>
  json<T>(text: TemplateStringsArray, ...params: {}[]): Promise<T[]>
  json<T>(query: IQuery): Promise<T[]>
  close(): void
}

export interface IQuery {
  text: string
  values: any[]
}

export interface IMigration {
  id: number
  name: string
  up: (db: IAdapter) => any
  down: (db: IAdapter) => any
}

export type IConfig = ConnectionConfig | string

export * from './connection'
export * from './migrations'
export * from './pool'
