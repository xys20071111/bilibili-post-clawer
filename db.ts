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

export class MongoDB {
  private client: MongoClient
  private db: any
  public posts: Collection<PostDocument>
  public replies: Collection<ReplyDocument>

  constructor() {
    if (!Config.mongodb) {
      throw new Error("MongoDB configuration is missing")
    }
    this.client = new MongoClient(Config.mongodb.uri)
    this.posts = null!
    this.replies = null!
  }

  async connect() {
    await this.client.connect()
    this.db = this.client.db(Config.mongodb!.database)
    this.posts = this.db.collection(Config.mongodb!.collections.posts) as Collection<PostDocument>
    this.replies = this.db.collection(Config.mongodb!.collections.replies) as Collection<ReplyDocument>

    await this.createIndexes()
  }

  async createIndexes() {
    await this.posts.createIndex({ id: 1 }, { unique: true })
    await this.replies.createIndex({ rpid: 1 }, { unique: true })
    await this.replies.createIndex({ oid: 1 })
  }

  async close() {
    await this.client.close()
  }

  async savePost(id: string, from: string, data: any) {
    await this.posts.insertOne({ id, from, data, fetchedAt: new Date() })
  }

  async getAllPosts(): Promise<PostDocument[]> {
    return await this.posts.find({}, { noCursorTimeout: true }).toArray()
  }

  async getPostById(id: string): Promise<PostDocument | null> {
    return await this.posts.findOne({ id })
  }

  async saveReply(reply: ReplyDocument) {
    await this.replies.insertOne({ ...reply, fetchedAt: new Date() })
  }
}

export const db = new MongoDB()
