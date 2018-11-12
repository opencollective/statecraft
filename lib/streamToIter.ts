
export type AsyncIterableIteratorWithRet<T> = AsyncIterableIterator<T> & {
  // AsyncIterableIterator declares the return function to be optional.
  // Having a return function is compulsory - its how the subscription is closed.
  // The value passed to return is ignored.
  return(value?: any): Promise<IteratorResult<T>>
}


export interface Stream<T> {
  append(val: T): void,
  end(): void,
  throw(err: any): void,
  iter: AsyncIterableIteratorWithRet<T>,
}

// Note: onCancel is not called if the producer calls .end().
export default function<T>(onCancel?: () => void): Stream<T> {
  // At least one of these lists is empty at all times.
  const buffer: T[] = []
  const resolvers: ([(v: IteratorResult<T>) => void, (err: any) => void])[] = []

  // Done signifies that there will be no more messages after the current
  // buffer runs dry.
  let done = false
  // Err signifies that something went wrong in the producer. Any subsequent
  // reads after the buffer will hit a promise rejection.
  let err: any | null = null

  const iter: AsyncIterableIteratorWithRet<T> = {
    // Calls to next() either eat the first item in buffer or create a new resolver.
    next(): Promise<IteratorResult<T>> {
      if (buffer.length) return Promise.resolve({value: buffer.shift()!, done: false})
      else if (err) return Promise.reject(err)
      else if (done) return Promise.resolve({value: undefined as any as T, done: true})
      else return new Promise((resolve, reject) => {
        resolvers.push([resolve, reject])
      })
    },
    return(): Promise<IteratorResult<T>> {
      // NOTE: return() here is for the iterator *consumer* to notify the
      // producer that they're done, and they don't want any more items. The
      // producer should call end(), which will still let the consumer eat the
      // last items before we start returning {done}.
      done = true

      // The resolvers list will almost certainly be empty anyway.
      for (const r of resolvers) {
        // This is silly.
        // https://github.com/Microsoft/TypeScript/issues/11375
        r[0]({value: undefined, done: true} as any as IteratorResult<T>)
      }

      buffer.length = resolvers.length = 0
      onCancel && onCancel()
      onCancel = undefined // Avoid calling it again if we're called twice.
      return Promise.resolve({done} as any as IteratorResult<T>)
    },
    [Symbol.asyncIterator]() { return iter }
  }

  return {
    append(val) {
      // console.log('stream app', done, resolvers)
      if (done || err) return

      if (resolvers.length) {
        ;(resolvers.shift()!)[0]({value: val, done: false})
      } else {
        // TODO: We should collapse the catchup data objects in buffer.
        buffer.push(val)
      }
    },

    end() {
      // NOTE: This does *NOT* call onCancel, since its triggered by the producer.
      // You should clean up yourself if you call this.
      done = true
      while (resolvers.length) {
        (resolvers.shift()!)[0]({value: undefined as any as T, done: false})
      }
    },

    throw(_err) {
      // Put an error at the end of the stream. Any further reads will see it.
      // Note that this is for the *producer*
      err = _err
      onCancel && onCancel()
      onCancel = undefined
    },

    iter,
  }
}
