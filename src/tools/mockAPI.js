const { trimStart, flow } = require("lodash");
const express = require("express");
const fse = require("fs-extra");
const yargs = require("yargs");
const path = require("path");
const glob = require("glob");
const ora = require("ora");

const app = express();

const settings = {
  port: 8080,
  ip: "127.0.0.1",
  mountRoot: "/",
};

const writeContent = async (file, req, res) => {
  const promisedResponse = fse.readFile(file, "utf8");
  ora.promise(
    promisedResponse,
    `Resolving request for ${req.originalUrl} \n  with ${file}`
  );
  const {
    status = 200,
    timeout = 1,
    ...rest
  } = JSON.parse(await promisedResponse);

  res.writeHead(status, {
    "Content-Type": "application/json",
  });

  setTimeout(() => {
    res.write(rest && JSON.stringify(rest));
    res.end();
  }, timeout);
};

const replaceDynamicParam = ({ url, ...rest }) => ({
  url: url.replace(new RegExp(/\{/g), ":").replace(new RegExp(/\}/g), ""),
  ...rest,
});

const replaceQueryParams = (mappingObj) => {
  const { url } = mappingObj;
  const queryPattern = /\/\[[^/]+\]\/[^/]+/g;
  const matches = url.match(queryPattern);
  return matches
    ? {
        url: url.replace(queryPattern, ""),
        query: matches.map((m) => {
          const [, name, value] = m.match(/\/\[([^/]+)\]\/([^/]+)/);
          return {
            name,
            value,
          };
        }),
      }
    : mappingObj;
};

const asyncMiddleware = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const startMockServer = async (argv, { ip, port }) => {
  try {
    app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", req.headers.origin);
      res.header("Access-Control-Allow-Credentials", "true");
      res.header(
        "Access-Control-Allow-Headers",
        "Authorization, cache-control, Origin, X-Requested-With, Content-Type, Accept, x-messageId, x-appCorrelationId, x-brandId, x-channelType"
      );
      res.header(
        "Access-Control-Allow-Methods",
        "PUT, POST, GET, DELETE, OPTIONS"
      );

      next();
    });

    if (argv.staticMock) {
      const promisedMockExists = fse.exists(argv.staticMock);
      ora.promise(
        promisedMockExists,
        `Verifying if static mock files exist on ${argv.staticMock}\n`
      );
      const staticMockExists = await promisedMockExists;

      if (!staticMockExists) {
        throw new Error(
          `Static mocks were not found on the path specified. Make sure they exist`
        );
      }

      const files = glob.sync(`${argv.staticMock}/**/*.json`);

      if (files.length) {
        console.log(`Found api mocks at`);
        console.log(`\t${files.join("\n\t")}\n`);
      }

      await Promise.all(
        files.map(async (file) => {
          const relativePath = file.replace(argv.staticMock, "");
          const [method] = path.basename(relativePath).split(".");

          const relativeUrl = relativePath
            .replace(/\.?default\.json/, "")
            .replace(/\.json/, "")
            .replace(/(delete|post|put|get)\.?/, "");

          const mappingObj = {
            url: `${settings.mountRoot}${trimStart(relativeUrl, "/")}`,
            query: [],
          };

          const mappedObj = flow(
            replaceQueryParams,
            replaceDynamicParam
          )(mappingObj);

          const { url: mappedUrl, query: mappedQuery } = mappedObj;

          console.log(
            `Mapping listener on http://${ip}:${port}${mappedUrl}${
              mappedQuery.length > 0
                ? `?${mappedQuery
                    .reduce(
                      (acc, { name, value }) => `${acc}&${name}=${value}`,
                      ""
                    )
                    .slice(1)}`
                : ""
            }`
          );

          switch (method) {
            case "post":
              await app.post(
                mappedUrl,
                asyncMiddleware(async (req, res) => {
                  await writeContent(file, req, res);
                })
              );
              break;
            case "put":
              await app.put(
                mappedUrl,
                asyncMiddleware(async (req, res) => {
                  await writeContent(file, req, res);
                })
              );
              break;
            case "delete":
              await app.delete(
                mappedUrl,
                asyncMiddleware(async (req, res) => {
                  await writeContent(file, req, res);
                })
              );
              break;
            default:
              await app.get(
                mappedUrl,
                asyncMiddleware(async (req, res) => {
                  await writeContent(file, req, res);
                })
              );
              break;
          }
        })
      );
    }

    app.listen(port, ip);
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const yargsCommand = {
  command: "$0",
  desc: "Initialise an ExpressJS mock server with endpoints served from static json resources",
  handler: async (argv) => {
    const conf = {
      ip: argv.ip || settings.ip,
      port: argv.port || settings.port,
    };

    const promise = startMockServer(argv, conf);
    ora.promise(
      promise,
      `Mock server started on http://${argv.ip}:${argv.port}`
    );
    await promise;
    console.log();
  },
};

const yargsOptions = {
  verbose: {
    alias: "v",
    describe: "Provide verbose information",
    default: false,
  },
  ip: {
    alias: "i",
    describe: "IP address where the mock server will be hosted",
    default: "0.0.0.0",
  },
  port: {
    alias: "p",
    describe: "Port where the mock server will listen",
    default: "8080",
  },
  "static-mock": {
    alias: "M",
    describe:
      "Path of the root directory where the static api mocks are placed",
    default: "./mock-api",
  },
};

yargs.command(yargsCommand).options(yargsOptions).version(false).help().parse();
