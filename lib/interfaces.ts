// single: Return one value (the content of the store). Query ignored
// allkv: Query all key-values in a kv database. Similar to single, but enforces kv.
// kv: Query with a set of keys, return corresponding values.
// sortedkv: Query set of ranges. return kv map with contained values

export enum QueryType {
  Single = 1,
  KV = 2,
  AllKV = 3,
  Range = 4,
  StaticRange = 5,
}

export enum ResultType {
  // Raw = 0,
  Single = 1,
  KV = 2,
  Range = 4,
}

// export type QueryType = 'single' | 'allkv' | 'kv' | 'range' | 'static range'
// export type ResultType = 'single' | 'kv' | 'range'

export type Version = Uint8Array
export type Source = string
export type Key = string // TODO: Relax this restriction.
export type KVPair<Val> = [Key, Val]

export type KVQuery = Set<Key>

// In the context of a store's sources (the first result matches the first of
// the stores' listed sources in storeinfo).
export type FullVersion = (Version | null)[]

export type VersionRange = {from: Version, to: Version}
// In the context of a store's sources
export type FullVersionRange = (VersionRange | null)[]

export type StaticKeySelector = {
  k: Key,
  isAfter: boolean, // is the key itself included
}
export type KeySelector = StaticKeySelector & {
  offset: number, // walk + or - from the specified key
}

export type StaticRange = {
  low: StaticKeySelector,
  high: StaticKeySelector,
  // If true, results will be returned in reverse lexicographical
  // order beginning with range.high.
  reverse?: boolean, // default false.
}
export type Range = {
  low: KeySelector,
  high: KeySelector,
  reverse?: boolean, // as above, default false.

  // If non-zero, limits the number of documents returned. TODO: Add marker in
  // results somehow showing that there are more results after the limit.
  limit?: number, // default 0.
}
export type RangeQuery = Range[]
export type StaticRangeQuery = StaticRange[]
// Outside in we have:
// 1. List of ranges
// 2. Document item in the list
// 3. Key / Value pair
export type RangeResult<Val> = [Key, Val][][]

// Wrapping single and allkv like this is sort of dumb, but it works better
// with TS type checks.
export type Query = {type: QueryType.Single | QueryType.AllKV, q: boolean} | {
  type: QueryType.KV,
  q: KVQuery,
} | {
  type: QueryType.Range,
  q: RangeQuery,
} | {
  type: QueryType.StaticRange,
  q: StaticRangeQuery,
}

// This is an internal type. Its sort of gross that it exists. I think
// eventually I'd like to move to using a single "empty" query type that
// completed queries end up at.
export type QueryData = boolean | KVQuery | StaticRangeQuery | RangeQuery

export type ResultData<Val> = any | Map<Key, Val> | RangeResult<Val>


// For now this is just used for snapshot replacements. It'll probably need work.
export type ReplaceQuery = {type: QueryType.Single | QueryType.AllKV, q: boolean} | {
  type: QueryType.KV,
  q: KVQuery,
} | {
  type: QueryType.StaticRange,
  q: StaticRangeQuery[], // !!
} // TODO: What should this be for full range queries?
export type ReplaceQueryData = boolean | KVQuery | StaticRangeQuery[]

export type ReplaceData<Val> = any | Map<Key, Val> | RangeResult<Val>[]


// export type Result = {
//   type: 'single',
//   d: any
// } | {
//   type: 'kv',
//   d: Map<Key, Val>
// }

export interface SingleOp<Val> {
  readonly type: string,
  readonly data?: any,

  // Optional. Used when supportedTypes doesn't match.
  readonly newval?: Val,
}

export type Metadata = {
  uid?: string, // unique ID
  ts?: number, // timestamp
}

// Only a list if the op type doesn't support compose. (Both set and rm support compose.)
export type Op<Val> = SingleOp<Val> | SingleOp<Val>[]
export type SingleTxn<Val> = Op<Val>
export type KVTxn<Val> = Map<Key, Op<Val>>
// Ideally this would be a sparse list. Not a big deal in practice though.
export type RangeTxn<Val> = [Key, Op<Val>][][]
// But which one? For stores which implement KV + Range, they'll (obviously)
// end up propogating a KVTxn through onTxn. Right now RangeTxn is only used
// for range subscriptions.
export type Txn<Val> = SingleTxn<Val> | KVTxn<Val> | RangeTxn<Val>
export type TxnWithMeta<Val> = {
  versions: FullVersion, // Version after txn applied (nulls for parts unchanged)
  txn: Txn<Val>,
  meta: Metadata, // Unique ID generated by the client.
}

export type FetchOpts = {
  // Don't actually return any data. Useful for figuring out the version. Default: false
  readonly noDocs?: boolean,

  /**
   * Request that results are returned at a version >= the version specified. If
   * the store does not have data at the specified version yet, it should wait
   * for results to be available before returning.
   */ 
  readonly minVersion?: FullVersion

  // Request that the results are returned at the exact specified version.
  // Stores should return VersionTooOldError if the version is too far in the
  // past. This could take a version range instead, but I'm not sure
  // what the stores would do with the full range information.
  //
  // TODO: This isn't currently tested or supported by most stores.
  // TODO: Figure out how this should interact with minVersion.
  readonly atVersion?: FullVersion,


  // Results already known at specified version. Return nothing in this case.
  // readonly knownAtVersions?: FullVersion,
  // TODO: knownDocs?

}

export type FetchResults<Val, R = ResultData<Val>> = {
  // This is returned so implementors can bake out the query into a static
  // query. Eg, a range query (with limits and offsets) will be baked out to a
  // static range query with none of that, and returned alongside the data
  // itself. I'll probably make this optional in the future - for most queries
  // it won't be used anyway, and passing around the queryRun is noise & takes
  // up unnecessary space on the wire. Note that this may still become useful
  // for KV queries if limits can be specified in the fetch options.
  bakedQuery?: Query,

  results: R,
  versions: FullVersionRange, // Range across which version is valid.

  // TODO: Maybe return a JSON-friendly opaque cursor structure here, which
  // can be passed back to the store to continue the fetch results when limits
  // are sent & applied.
}

// export type Callback<T> = (err: Error | null, results?: T) => void

export type FetchFn<Val> = (q: Query, opts?: FetchOpts) => Promise<FetchResults<Val>>




export interface GetOpsOptions {
  // Supported client-side operation types. Also forwarded to getOps.
  readonly supportedTypes?: Set<string>, // TODO.

  // Ignore supportedTypes, just send full received ops. (default false)
  // readonly raw?: boolean,

  // bestEffort: if we can't get all the requested operations, don't abort
  //   but return what we can.
  readonly bestEffort?: boolean,

  // Options NYI:
  // - limitBytes: Limit on the amount of data to read & return. Advisory
  //   only. Will always try to make progress (that is, return at least one
  //   operation). There is no limitDocs equivalent because you can just
  //   shrink the requested range if thats what you're after. NYI
  // - limitOps: Limit the number of operations returned. NYI

  // Limit the number of ops returned.
  readonly limitOps?: number,
}

export type GetOpsResult<Val> = {
  ops: TxnWithMeta<Val>[],

  // This should return the range (from, to] of the returned set for each
  // source, across which the results are valid. This will be the same as
  // the input if all ops are available and included in the query, and there
  // are no limits.
  versions: FullVersionRange,
}

// If the to version in a version range is empty, fetch the open range (from..]
export type GetOpsFn<Val> = (q: Query, versions: FullVersionRange, opts?: GetOpsOptions) => Promise<GetOpsResult<Val>>



export type CatchupData<Val> = {
  // This is more complicated than I'd like, but I'm reasonably happy with it.
  // The problem is that catchup isn't always possible, so sometimes you just
  // gotta send a diff with new documents in it; and you have no idea how you
  // got there.

  // Replace the results in q with this result set, if it exists
  replace?: {
    // This is a bit of a hack. If the query here contains more keys / ranges
    // than the original request, they should be added to the active known
    // set.
    //
    // Queries are currently only expanded, so this works but a QueryDelta
    // would be better.
    //
    // Its awkward for ranges. For now the query contains a list of query
    // parts matching the original query. Each part is either a noop or its a
    // range query extension. (And then `with` is a standard KV[][]).
    q: ReplaceQuery,
    with: ReplaceData<Val>,

    // This is the max version for each source of the replacement data. This
    // becomes from:X if ingesting into a FullVersonRange.
    versions: FullVersion,
  },

  txns: TxnWithMeta<Val>[], // ... then apply txns.

  // This is the known upper end of the valid version range of the data
  // returned by catchup. For subscriptions this is a diff from what has been
  // reported previously, and usually it will just replay the max versions
  // listen in txns. But when calling alwaysNotify, this will keep updating as
  // the validity of the versions of the known data grows. This becomes to:X
  // when ingesting into a FullVersionRange. All sources here must have either
  // been passed in to subscribe / catchup or listed in a replace.
  toVersion: FullVersion,

  // Having received this update chunk, is the client now up-to-date?
  caughtUp: boolean,
}
// The updates argument here could either work as
//  {txn, v:fullrange}[]
// or
//  {txn, source, v:version}[] like in getOps.
// Its inconsistent how it is now, but this also makes it much more convenient
// to aggregate.


export interface CatchupOpts {
  // TODO: Probably more stuff needs to go in here.
  readonly supportedTypes?: Set<string>,
  readonly raw?: boolean,
  readonly aggregate?: 'yes' | 'prefer no' | 'no',
  readonly bestEffort?: boolean,

  readonly limitDocs?: number,
  readonly limitBytes?: number,
}
export type CatchupFn<Val> = (q: Query, fromVersion: FullVersion, opts: CatchupOpts) => Promise<CatchupData<Val>>


export interface SubscribeOpts {
  // Supported client-side operation types. Also forwarded to getOps.
  readonly supportedTypes?: Set<string>,

  // I'd like to get rid of this. If this is set, the subscription will
  // track the value itself to support filtering by supported types.
  // This should be an internal implementation detail.
  readonly trackValues?: boolean,

  // Ignore supportedTypes, just send full received ops. (default false)
  readonly raw?: boolean,

  // Can the store aggregate old updates into replacement data instead of
  // sending the full operation set? This will not always be possible - for
  // example, the backend server might have paged out / deleted old
  // operations.
  //
  // If never is passed, the server should error if the full operation log is
  // not available.
  readonly aggregate?: 'yes' | 'prefer no' | 'no',

  // bestEffort: if we can't get all the requested operations, don't error
  // but return what we can. Passed through to catchup & getOps.
  readonly bestEffort?: boolean,

  // Always notify about version bumps even if the query results are empty?
  // (default false)
  readonly alwaysNotify?: boolean,

  // Just subscribe to whatever's there, from the current version. If this is
  // passed, fromVersion is ignored and you just get all operations as they're
  // streamed live.
  // Functionally equivalent to calling subscribe(q, (await fetch(q, {noDocs:true})).version)).
  // readonly fromCurrent?: boolean,

  // Subscribe from the specified version. If this is passed, we'll send ops

  // TODO: Maybe rename current -> 'raw' ?
  fromVersion?: FullVersion | 'current',

  // NYI:
  // - Follow symlinks? (NYI)
  // - When we poll, how much data should we fetch? (opts.limitDocs, opts.limitBytes)
  // - Stop the query after a certain number of operations (opts.limitOps) (NYI)
  // readonly limitBytes: number,
}

export type AsyncIterableIteratorWithRet<T> = AsyncIterableIterator<T> & {
  // AsyncIterableIterator declares the return function to be optional.
  // Having a return function is compulsory - its how the subscription is closed.
  // The value passed to return is ignored.
  return(value?: any): Promise<IteratorResult<T>>,
}

export type Subscription<Val> = AsyncIterableIteratorWithRet<CatchupData<Val>>


// A subscription gives you a stream of operations. There's 3 modes a
// subscription can run in:
//
// 1. Fetch and subscribe. This is the default if you don't pass any options.
// The first update from the subscription will contain a replace: {} object
// with all the results from fetching the query, and subsequent updates will
// modify the query as needed.
//
// 2. Subscribe only. If you pass in fromVersion: {...} in the options, that
// indicates that the caller already has a copy of the query results at the
// specified version. We don't do any fetch, and instead just catch up from
// the specified version onwards. Use opts.aggregate to control whether the
// server is allowed to aggregate the initial catchup.
//
// 3. Raw subscribe. If you pass fromVersion: 'current', you get all
// operations as they come in.
export type SubscribeFn<Val> = (q: Query, opts?: SubscribeOpts) => AsyncIterableIteratorWithRet<CatchupData<Val>>





export interface MutateOptions {
  conflictKeys?: Key[], // TODO: Add conflict ranges.
  meta?: Metadata,
}

// TODO: Consider wrapping ResultType + txn in an object like I did with Query.
// Also the TxnWithMeta is made from txn, versions and opts.meta. Might be better to just pass a TxnWithMeta straight in.
export type MutateFn<Val> = (type: ResultType, txn: Txn<Val>, versions?: FullVersion, opts?: MutateOptions) => Promise<FullVersion>
// export type MutateFn2 = (type: ResultType, txn: Txn | TxnWithMeta, opts?: MutateOptions) => Promise<FullVersion>




export type OpsSupport = 'none' | 'partial' | 'all' // TODO
export interface Capabilities {
  // TODO: Add a way to mark if we can subscribe over ranges or just static
  // ranges

  // These are bitsets.
  readonly queryTypes: number,
  readonly mutationTypes: number,
  readonly ops?: OpsSupport, // TODO
}

export interface StoreInfo {
  readonly uid: string, // Ideally, string or byte array or something.
  
  // Unique and lexographically sorted.
  readonly sources: Source[],

  readonly capabilities: Capabilities,

  // And ideally, recursive querying support.
  [k: string]: any
}

export type TxnListener<Val> = (
  source: Source,
  fromV: Version, toV: Version,
  type: ResultType, txn: Txn<Val>,
  meta: Metadata
) => void



export interface Store<Val> {
  readonly storeInfo: StoreInfo, // TODO: Should this be a promise?

  // (q: Query, opts?: FetchOpts) => Promise<FetchResults>
  readonly fetch: FetchFn<Val>,

  // These are added automatically when store is augmented, but they can be supplied directly.
  readonly catchup?: CatchupFn<Val>,


  // catchup?: CatchupFn, // Can be generated from fetch. I think I can keep this private.


  // Versions are [{from, to}] pairs where the data returned is in
  // the range of (from, to]. You can think of the results as the operations
  // moving from document version from to document version to.
  //
  // to:-1 will get all available operations.
  readonly getOps: GetOpsFn<Val>


  // For reconnecting, you can specify knownDocs, knownAtVersions
  // - ... And something to specify the catchup mode (fast vs full)
  // - opts.getFullHistortForDocs - or something like it.
  // These options should usually appear together.
  readonly subscribe: SubscribeFn<Val>


  // Modify the db. txn is a map from key => {type, data}. versions is just source => v.
  // TODO: Consider adding a txnType argument here as well.
  //
  // # On versions:
  //
  // The version specified here is the current expected database version. The
  // transaction itself will have a version equal to the new database version,
  // which will be greater.
  //
  // The version can be elided if you don't care what the database has when the
  // operation is submitted.
  //
  // So for example, given db at version 10, mutate(v:10) => transaction at
  // v:11, and afterwards db is at v:11.
  readonly mutate: MutateFn<Val>,

  // If needed
  close(): void,


  // Start calling onTxn from the specified version (or latest if v not passed).
  // Returns a promise to the current version when we're ready.
  // start?(v?: FullVersion): Promise<FullVersion>

  // TODO: Remove me.
  // This is set by the store's wrapper. Could be implemented as an async
  // iterator - but this way makes it clear that we discard events when
  // there's no listener.
  // 
  // ... Eh. 🤷‍♀️
  // onTxn?: TxnListener<Val>,

  // And potentially other helper methods and stuff.
  // [k: string]: any
}

// This is a pretty standard OT type.
export interface Type<Snap, Op> {
  name: string,
  create(data?: any): Snap
  apply(snapshot: Snap, op: Op): Snap
  applyMut?(snapshot: Snap, op: Op): void
  checkOp?(op: Op, snapshot: Snap): void // Check the op is valid and can apply to the given snapshot

  // For core OT types:
  // Not sure if transform should be optional. TODO.
  transform?(op1: Op, op2: Op, side: 'left' | 'right'): Op,
  // And transform cursor and stuff.
  compose?(op1: Op, op2: Op): Op,

  snapToJSON?(data: Snap): any,
  snapFromJSON?(data: any): Snap,
  opToJSON?(data: Op): any,
  opFromJSON?(data: any): Op,

  [p: string]: any
}

export type AnyOTType = Type<any, any>

// Basically, the replace section of catchup data.
export type CatchupReplace<Val, Q extends ReplaceQuery, R extends ReplaceData<Val>> = {q: Q, with: R}

export interface QueryOps<Q> {
  // I want Val to be an associated type. I've been spoiled with rust...

  type: QueryType
  // createEmpty(q?: Q): Q
  toJSON(q: Q): any
  fromJSON(data: any): Q

  mapKeys?(q: Q, fn: (k: Key, i: number) => Key | null): Q

  /**
   * Adapt the specified transaction (of the expected type) to the passed in
   * query. If the transaction doesn't match any part of the query, returns
   * null.
   */
  adaptTxn<Val>(txn: Txn<Val>, query: QueryData): Txn<Val> | null

  // a must be after b. Consumes a and b. Returns result.
  composeCR<Val>(a: CatchupReplace<Val, any, any>, b: CatchupReplace<Val, any, any>): CatchupReplace<Val, any, any>

  // Convert a fetch into a catchup replace object.
  fetchToReplace<Val>(q: Q, data: ResultData<Val>): CatchupReplace<Val, any, any>

  // Consumes q and snapshot
  updateQuery(q: Q | null, op: ReplaceQueryData): Q

  resultType: ResultOps<any, any, any> // For some reason ResultOps<any, Txn<any>> errors
}


// This would be nicer with Rust's associated types.
export interface ResultOps<Val, R, T> extends Type<R, T> {
  type?: ResultType

  // name: ResultType
  compose(op1: T, op2: T): T
  composeMut?(op1: T, op2: T): void

  // Compose two consecutive result objects. Returns dest
  composeResultsMut(dest: R, src: R): R

  // Copy all items from src into dest. Returns dest.
  copyInto?(dest: R, src: R): R

  // Ughhhh the order of arguments here is so awkward.
  mapEntries<Val>(snap: R, fn: (k: Key | null, v: Val) => [Key | null, Val] | null): R
  mapEntriesAsync<Val>(snap: R, fn: (k: Key | null, v: Val) => Promise<[Key | null, Val] | null>): Promise<R>

  map<In, Out>(snap: R, fn: (v: In, k: Key | null) => Out): R
  mapAsync<In, Out>(snap: R, fn: (v: In, k: Key | null) => Promise<Out>): Promise<R>

  mapTxn<In, Out>(op: Txn<In>, fn: (v: Op<In>, k: Key | null) => Op<Out>): Txn<Out>
  mapTxnAsync<In, Out>(op: Txn<In>, fn: (v: Op<In>, k: Key | null) => Promise<Op<Out>>): Promise<Txn<Out>>

  // TODO: Add another generic parameter for snap here. Its a ReplaceData object.
  mapReplace<In, Out>(snap: any, fn: (v: In, k: Key | null) => Out): any

  // These are compulsory.
  snapToJSON(data: R): any
  snapFromJSON(data: any): R
  opToJSON(data: T): any
  opFromJSON(data: any): T

  // from(type: ResultType, snap: ResultData): R
  getCorrespondingQuery(snap: R): Query

  // Replace fancy types with {set} if they're not supported.
  filterSupportedOps(T: T, values: R, supportedTypes: Set<string>): T

  updateResults<Val>(snapshot: ResultData<Val>, q: ReplaceQuery, data: ReplaceData<Val>): ResultData<Val>

  // TODO: replace.
}
