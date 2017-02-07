//const hostSource = require('./hostsource')
const http = require('http')

const port = process.env.PORT || 5747
const root = require('./root')()

//http.createServer(hostSource(root)).listen(port)
//console.log(`root ${root.source} listening on ${port}`)

{
  const view = require('./view')(root, (x => -x))

  /*
  require('./tcpserver').tcpServer(view).listen(port, () => {
    console.log('listening on TCP port', port)
  })*/

  /*
  view.streamOps([['a', 'z']], null, (x => console.log('l', x)), (err, result) => {
    console.log('streaming', err, result)
  })*/
}



const router = require('./router')()

const remoteRoot = root//require('./tcpclient').tcpClient(port, 'localhost')
router.mount(remoteRoot, '', ['a', 'b'], '')
router.mount(remoteRoot, '', ['a', 'a~'], 'yo/')
router.mount(remoteRoot, '', ['j', 'k~'], 'yo/')
router.mount(remoteRoot, '', ['a', 'q~'], 'zz/')

//console.log('routes', router.routes)



/*
root.simpleSubKV(['a', 'b'], null, (x => console.log('l', x)), (err, result) => {
  console.log('streaming', err, result)
})
*/

/*
root.fetchKV(['a', 'b', 'c'], {}, (err, results) => {
  console.log('fetchkv', err, results)
})

root.fetchSKV(['<a', 1, '>c'], {}, (err, results) => {
  console.log('fetchskv', err, results)
})

*/

/*
const sub = root.subscribeSKV(['<a', 1, '>c'], {}, {supportedTypes:['inc'], notifyAll:false}, function(data, versions) {
  console.log('txn', data, versions)
  console.log('data result', this.data)
})

setTimeout(() => {
  console.log('modifying subscription')
  sub.modify(['<c', -1, '.', 0, '<z', 1, '.'], (err, newData) => {
    console.log('subscription modified', newData)
  })
}, 3000)
*/

/*
const sub = root.subscribeKV(['a', 'b', 'c'], {}, {notifyAll:false}, function(data, versions) {
  console.log('txn', data, versions)
  console.log('data result', this.data)
})

setTimeout(() => {
  console.log('modifying subscription')
  sub.modify({remove:['a'], add:['z']}, (err, newData) => {
    console.log('subscription modified', newData)
  })
}, 3000)
*/

require('./tcpserver').tcpServer(root).listen(port, () => {
  console.log('listening on TCP port', port)

  const remoteRoot = require('./tcpclient').tcpClient(port, 'localhost')
  /*
  const sub = remoteRoot.subscribeKV(['a', 'b', 'c'], {}, {notifyAll:false}, function(data, versions) {
    console.log('txn', data, versions)
    console.log('data result', this.data)
  })

  setTimeout(() => {
    console.log('modifying subscription')
    sub.modify({remove:['a'], add:['z']}, (err, newData) => {
      console.log('subscription modified', newData)
    })
  }, 3000)
*/

  const sub = remoteRoot.subscribeSKV(['<a', 1, '>c'], {}, {supportedTypes:['inc'], notifyAll:false}, function(data, versions) {
    console.log('txn', data, versions)
    console.log('data result', this.data)
  })

  setTimeout(() => {
    console.log('modifying subscription')
    sub.modify(['<c', -1, '.', 0, '<z', 1, '.'], (err, newData) => {
      console.log('subscription modified', newData)
    })
  }, 3000)


})

setTimeout(() => {
  const txn = new Map([['a', {type:'set', data:1000}], ['c', {type:'set', data:'hi'}]])
  root.mutate(txn, {[root.source]:0}, {}, (err, v) => {
    if (err) throw err
    console.log('operation accepted at version', v)
  })
}, 1000)
