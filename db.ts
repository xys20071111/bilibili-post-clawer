import { Collection, MongoClient, ObjectId } from "mongodb"
import { Config } from "./config.ts"

export interface PostDocument {
  _id?: ObjectId
  id: string
  from: string
  data: any
  fetchedAt: Date
}

export interface ReplyDocument {
  _id?: ObjectId
  rpid: string
  oid: string
  oidType: number
  ctime: number
  uid: string
  parent: string
  nickname: string
  content: string
  like: number
  replyControl: any
  fetchedAt?: Date
}

export interface FetchedPostDocument {
  _id?: ObjectId
  oid: string
  fetchedAt: Date
}

export class MongoDB {
  private client: MongoClient
  private db: any
  public posts: Collection<PostDocument>
  public replies: Collection<ReplyDocument>
  public fetchedPosts: Collection<FetchedPostDocument>

  constructor() {
    if (!Config.mongodb) {
      throw new Error("MongoDB configuration is missing")
    }
    this.client = new MongoClient(Config.mongodb.uri)
    this.posts = null!
    this.replies = null!
    this.fetchedPosts = null!
  }

  async connect() {
    await this.client.connect()
    this.db = this.client.db(Config.mongodb!.database)
    this.posts = this.db.collection(Config.mongodb!.collections.posts) as Collection<PostDocument>
    this.replies = this.db.collection(Config.mongodb!.collections.replies) as Collection<ReplyDocument>
    this.fetchedPosts = this.db.collection(Config.mongodb!.collections.fetchedPosts) as Collection<FetchedPostDocument>

    await this.createIndexes()
  }

  async createIndexes() {
    await this.posts.createIndex({ id: 1 }, { unique: true })
    await this.replies.createIndex({ rpid: 1 }, { unique: true })
    await this.replies.createIndex({ oid: 1 })
    await this.fetchedPosts.createIndex({ oid: 1 }, { unique: true })
  }

  async close() {
    await this.client.close()
  }

  async postExists(id: string): Promise<boolean> {
    return !!(await this.posts.findOne({ id }))
  }

  async savePost(id: string, from: string, data: any) {
    await this.posts.updateOne(
      { id },
      { $set: { id, from, data, fetchedAt: new Date() } },
      { upsert: true }
    )
  }

  async getAllPosts(): Promise<PostDocument[]> {
    return await this.posts.find().toArray()
  }

  async getPostById(id: string): Promise<PostDocument | null> {
    return await this.posts.findOne({ id })
  }

  async saveReply(reply: ReplyDocument) {
    await this.replies.updateOne(
      { rpid: reply.rpid },
      { $set: { ...reply, fetchedAt: new Date() } },
      { upsert: true }
    )
  }

  async hasFetchedPost(oid: string): Promise<boolean> {
    return !!(await this.fetchedPosts.findOne({ oid }))
  }

  async markPostAsFetched(oid: string) {
    await this.fetchedPosts.updateOne(
      { oid },
      { $set: { oid, fetchedAt: new Date() } },
      { upsert: true }
    )
  }

  async getAllFetchedPosts(): Promise<string[]> {
    const docs = await this.fetchedPosts.find().project({ oid: 1, _id: 0 }).toArray()
    return (docs as FetchedPostDocument[]).map((d) => d.oid)
  }
}

export const db = new MongoDB()
