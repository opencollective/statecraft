import * as I from '../types/interfaces'
import storeFromStreams from '../netclient'

import net = require('net')
import msgpack = require('msgpack-lite')

export default function(port: number, host: string, callback: I.Callback<I.Store>) {
  const socket = net.createConnection(port, host)

  const writer = msgpack.createEncodeStream()
  writer.pipe(socket)

  const reader = msgpack.createDecodeStream()
  socket.pipe(reader)

  storeFromStreams(reader, writer, callback)
}