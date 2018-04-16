const uuid = require("uuid")
const path = require("path")
const mount = require("koa-mount")
const parse = require("busboy-file-parser")
const dateformat = require("dateformat")

const imageUpload = (opts) => {

  let store
  try {
    store = require(`./${opts.provider}`)(opts)
  } catch (err) {
    throw new Error(`Error: ${err}`)
  }

  let {mimetypes, exts, filename} = opts
  if(mimetypes) mimetypes = mimetypes.map(m => m.toLocaleLowerCase())
  if(exts) exts = exts.map(e => e.toLocaleLowerCase()) 

  return async (ctx, next) => {
    // Validate Request
    if ("POST" !== ctx.method && !ctx.request.is("multipart/*")) {
      return await next()
    }

    // Parse request for multipart
    const {files} = await parse(ctx.req)

    // Check if any file is not valid mimetype
    if (mimetypes) {
      const invalidFiles = files.filter(file => {
        return !mimetypes.includes(file.mimeType.toLocaleLowerCase())
      })

      // Return err if any not valid
      if (invalidFiles.length !== 0) {
        ctx.status = 400
        ctx.body = `Error: Invalid type of files ${invalidFiles.map(file => `${file.filename}[${file.mimeType}]`)}`
        return
      }
    }

    // Check if any file is not valid ext
    if (exts) {
      const invalidFiles = files.filter(file => {
        return !exts.includes(file.filename.substring(file.filename.lastIndexOf(".") + 1).toLocaleLowerCase())
      })

      // Return err if any not valid
      if (invalidFiles.length !== 0) {
        ctx.status = 400
        ctx.body = `Error: Invalid type of files ${invalidFiles.map(file => file.filename)}`
        return
      }
    }

    // Simple date format func
    function dateFunc(storeDir) {
      const date =  dateformat(new Date(), 'yyyy/mm/dd');
      return `${storeDir}${date}`;
    }

    // Generate oss path
    let result = {};
    const storeDir = opts.storeDir ? `${opts.storeDir}/` : "";
    files.forEach(function (file) {
      const fname = typeof filename === "function" ? filename(file) : `${uuid.v4()}${path.extname(file.filename)}`;
      const fstoreDir = opts.storePathType === "explicit" ? storeDir : dateFunc(storeDir);
      result[file.filename] = {
        path: fstoreDir,
        filename: fname
      };
    });
    
    // Upload to OSS or folders
    try {
      await Promise.all(files.map(file => {
        const { path, filename } = result[file.filename]
        return store.put(`${path}/${filename}`, file)
      }))
    } catch (err) {
      ctx.status = 500
      ctx.body = `Error: ${err}`
      return
    }

    // Return result
    ctx.status = 200
    // Support < IE 10 browser
    ctx.res.setHeader("Content-Type", "text/html;charset=UTF-8")
    Object.keys(result).forEach(k => {
      const { path, filename } = result[k]
      result[k] = `${path}/${encodeURI(filename)}`
    })
    ctx.body = JSON.stringify(store.get(result))
    return
  }
}

module.exports = (options) => {
  if (!options.url) {
    throw new Error("Can not find option url")
  }
  return mount(options.url, imageUpload(options))
}
