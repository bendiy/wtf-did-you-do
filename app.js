#!/usr/bin/env node

/*jshint node:true, indent:2, curly:false, eqeqeq:true, immed:true, latedef:true, newcap:true, noarg:true,
regexp:true, undef:true, strict:true, trailing:true, white:true */
/*global _:true*/

// Define required.
var async = require('async'),
  config = require('./config'),
  exec = require("child_process").exec,
  fs = require("fs"),
  http = require('http'),
  querystring = require("querystring"),
  mkdirp = require('mkdirp'),
  path = require("path"),
  pg = require('pg'),
  rimraf = require('rimraf'),
  _ = require("underscore");

// Define app config settings.
var customDb = config.customDb,
  defaultDb = config.defaultDb,
  // Set to false to run sql files through sqlformat.org's API.
  sqlFormat = config.sqlFormat;

// Define app vars.
var application,
  schemas = {},
  schemasBackedUp = false,
  backedUpSchemas = [],
  customSchemasDiff,
  defaultSchemasDiff,
  views = {},
  customViewsDiff,
  defaultViewsDiff,
  overwrittenViewsDef,
  overwrittenViewsDiff,
  viewsBackedUp = false,
  backedUpViews = [],
  functions = {},
  customFunctionsDiff,
  defaultFunctionsDiff,
  overwrittenFunctionsDef,
  overwrittenFunctionsDiff,
  functionsBackedUp = false,
  backedUpFunctions = [],
  customDbName,
  defaultDbName,
  customClient = new pg.Client(customDb),
  defaultClient = new pg.Client(defaultDb),
  sqlFormatAPI = {
    host: 'sqlformat.org',
    port: '80',
    path: '/api/v1/format',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  };

customClient.connect();
defaultClient.connect();

/**
 * Helper function to perform queries on either client.
 */
var query = function (dbClient, sqlQuery, params, next) {
  "use strict";

  var callback = function (err, result) {
    if (err) {
      return console.error('error running query', err);
    }
    next(result);
  };

  dbClient.query(sqlQuery, params, callback);
};

/**
 * Helper function to remove a directory if it exists and the create it.
 */
var prepareDirectory = function (dirPath, next) {
  "use strict";

  var mkDir = function () {
        // Create the directory.
        mkdirp(path.join(__dirname, dirPath), function (mkErr) {
          if (mkErr) {
            console.error(mkErr);
            next();
          }
          else {
            next();
          }
        });
      };

  fs.exists(dirPath, function (exists) {
    if (exists) {
      // Remove the old directory and it's contents.
      rimraf(path.join(__dirname, dirPath), function (err) {
        if (err) {
          console.error(err);
          next();
        } else {
          // Create the directory.
          mkDir();
        }
      });
    } else {
      // Create the directory.
      mkDir();
    }
  });
};

/**
 * Helper function to call the sqlformat.org's API and format an sql file.
 */
var formatSql = function (fileContents, next) {
  "use strict";

  if (!sqlFormat) {
    // Do not format the file. We are limited to 500 requests per day.
    next(fileContents);
    return;
  }

  var formatRequest = querystring.stringify(
    {
      sql: fileContents,
      reindent: 1,
      indent_width: 2
    }
  ),
  req;

  sqlFormatAPI.headers['Content-Length'] = formatRequest.length;

  req = http.request(sqlFormatAPI, function (res) {
    var data = '';

    res.on('data', function (chunk) {
      data += chunk;
    });

    res.on('end', function () {
      var formattedFileContents = JSON.parse(data);
      next(formattedFileContents.result);
    });
  });

  req.write(formatRequest);
  req.end();
};

/**
 * Set list of all schemas on the customClient database.
 */
var setCustomSchemas = function (result) {
  "use strict";

  if (result) {
    schemas.customDb = result.rows[0].schemas;

    // Continue to next step.
    application();
  } else {
    // Get list of all schemas from customClient database.
    query(customClient, 'select array_agg(schema_name::text) as schemas from information_schema.schemata', [], setCustomSchemas);
  }
};

/**
 * Set list of all schemas on the defaultClient database.
 */
var setDefaultSchemas = function (result) {
  "use strict";

  if (result) {
    schemas.defaultDb = result.rows[0].schemas;

    // Continue to next step.
    application();
  } else {
    // Get list of all schemas from defaultClient database.
    query(defaultClient, 'select array_agg(schema_name::text) as schemas from information_schema.schemata', [], setDefaultSchemas);
  }
};

/**
 * Get the name of the customClient database.
 */
var initCustom = function (result) {
  "use strict";

  if (result) {
    customDbName = result.rows[0].database;
    console.log("Customized Database: ", customDbName);

    // Continue to next step.
    setCustomSchemas();
  } else {
    // Get name of customClient database.
    query(customClient, 'select current_database() as database', [], initCustom);
  }
};

/**
 * Get the name of the defaultClient database.
 */
var initDefault = function (result) {
  "use strict";

  if (result) {
    defaultDbName = result.rows[0].database;
    console.log("Default Database: ", defaultDbName);

    // Continue to next step.
    setDefaultSchemas();
  } else {
    // Get name of defaultClient database.
    query(defaultClient, 'select current_database() as database', [], initDefault);
  }
};

/**
 * Set list of all views on the customClient database.
 */
var setCustomViews = function (result) {
  "use strict";

  if (result) {
    views.customDbDef = result.rows;

    // Continue to next step.
    application();
  } else {
    var sql = "select table_schema, table_name, view_definition " +
              "from INFORMATION_SCHEMA.views",
        skipCustomSchemas = customSchemasDiff.map(function (arr) {
          return arr.slice();
        });

    // Ignore xm, xt and sys schemas because we rebuild these views each time in build_app.
    skipCustomSchemas.push('xm', 'xt', 'sys');

    if (skipCustomSchemas.length) {
      sql = sql + " where table_schema not in (";

      for (var i = 0; i < skipCustomSchemas.length; i++) {
        sql = sql + "$" + (i + 1) + ",";
      }
      // Remove last comma.
      sql = sql.replace(/[,;]$/, '');
      sql = sql + ")";
    }

    // Get list of all Views from customClient database.
    query(customClient, sql, skipCustomSchemas, setCustomViews);
  }
};

/**
 * Set list of all views on the defaultClient database.
 */
var setDefaultViews = function (result) {
  "use strict";

  if (result) {
    views.defaultDbDef = result.rows;

    // Continue to next step.
    application();
  } else {
    var sql = "select table_schema, table_name, view_definition " +
              "from INFORMATION_SCHEMA.views",
        skipDefaultSchemas = defaultSchemasDiff.map(function (arr) {
          return arr.slice();
        });

    // Ignore xm, xt and sys schemas because we rebuild these views each time in build_app.
    skipDefaultSchemas.push('xm', 'xt', 'sys');

    if (skipDefaultSchemas.length) {
      sql = sql + " where table_schema not in (";

      for (var i = 0; i < skipDefaultSchemas.length; i++) {
        sql = sql + "$" + (i + 1) + ",";
      }
      // Remove last comma.
      sql = sql.replace(/[,;]$/, '');
      sql = sql + ")";
    }

    // Get list of all Views from defaultClient database.
    query(defaultClient, sql, skipDefaultSchemas, setDefaultViews);
  }
};

/**
 * Set list of all functions on the customClient database.
 */
var setCustomFunctions = function (result) {
  "use strict";

  if (result) {
    functions.customDbDef = result.rows;

    // Continue to next step.
    application();
  } else {
    var sql = "SELECT n.nspname as func_schema, " +
              "  p.proname as func_name, " +
              "  pg_catalog.pg_get_function_arguments(p.oid) as func_args, " +
              "  CASE " +
              "    WHEN p.proisagg THEN 'agg' " +
              "    WHEN p.proiswindow THEN 'window' " +
              "    WHEN p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype THEN 'trigger' " +
              "    ELSE 'normal' " +
              "  END as func_type, " +
              "  CASE " +
              "    WHEN p.proisagg THEN 'agg' " +
              "    ELSE pg_catalog.pg_get_functiondef(p.oid) " +
              "  END as func_definition " +
              "  FROM pg_catalog.pg_proc p " +
              "    LEFT JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace " +
              "  WHERE true ",
        skipCustomSchemas = customSchemasDiff.map(function (arr) {
          return arr.slice();
        });

    // Ignore xm, xt and sys schemas because we rebuild these functions each time in build_app.
    skipCustomSchemas.push('xm', 'xt', 'sys');

    if (skipCustomSchemas.length) {
      sql = sql + " AND n.nspname NOT IN (";

      for (var i = 0; i < skipCustomSchemas.length; i++) {
        sql = sql + "$" + (i + 1) + ",";
      }
      // Remove last comma.
      sql = sql.replace(/[,;]$/, '');
      sql = sql + ")";
    }

    sql = sql + " ORDER BY 1, 2, 4";

    // Get list of all Functions from customClient database.
    query(customClient, sql, skipCustomSchemas, setCustomFunctions);
  }
};

/**
 * Set list of all functions on the defaultClient database.
 */
var setDefaultFunctions = function (result) {
  "use strict";

  if (result) {
    functions.defaultDbDef = result.rows;

    // Continue to next step.
    application();
  } else {
    var sql = "SELECT n.nspname as func_schema, " +
              "  p.proname as func_name, " +
              "  pg_catalog.pg_get_function_arguments(p.oid) as func_args, " +
              "  CASE " +
              "    WHEN p.proisagg THEN 'agg' " +
              "    WHEN p.proiswindow THEN 'window' " +
              "    WHEN p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype THEN 'trigger' " +
              "    ELSE 'normal' " +
              "  END as func_type, " +
              "  CASE " +
              "    WHEN p.proisagg THEN 'agg' " +
              "    ELSE pg_catalog.pg_get_functiondef(p.oid) " +
              "  END as func_definition " +
              "  FROM pg_catalog.pg_proc p " +
              "    LEFT JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace " +
              "  WHERE true ",
        skipDefaultSchemas = defaultSchemasDiff.map(function (arr) {
          return arr.slice();
        });

    // Ignore xm, xt and sys schemas because we rebuild these functions each time in build_app.
    skipDefaultSchemas.push('xm', 'xt', 'sys');

    if (skipDefaultSchemas.length) {
      sql = sql + " AND n.nspname NOT IN (";

      for (var i = 0; i < skipDefaultSchemas.length; i++) {
        sql = sql + "$" + (i + 1) + ",";
      }
      // Remove last comma.
      sql = sql.replace(/[,;]$/, '');
      sql = sql + ")";
    }

    sql = sql + " ORDER BY 1, 2, 4";

    // Get list of all Functions from defaultClient database.
    query(defaultClient, sql, skipDefaultSchemas, setDefaultFunctions);
  }
};


/**
 * Backup all custom, missing and overwritten views.
 */
var backupSchema = function (dbClient, schema, callback) {
  "use strict";

  var foo = true;
  var pgDump = "pg_dump" +
    " -U " + dbClient.connectionParameters.user +
    " -h " + dbClient.connectionParameters.host +
    " -p " + dbClient.connectionParameters.port +
    " " + dbClient.connectionParameters.database +
    " -Fc -b -n " + schema +
    " -f " + "backup/" + dbClient.connectionParameters.database + "_schemas/" +
    schema + ".backup";

  // pg_dump this schema.
  var child = exec(pgDump, function (err, res) {
    if (err) {
      console.log("pg_dump error", err);
    }
  });

  child.on('exit', function (code) {
    // Done backing up this schema. Notify parent so it can move on.
    backedUpSchemas.push(schema);
    callback(null, schema);
  });
};

var backupSchemas = function (dbClient, next) {
  "use strict";

  var callback = function (err, doneSchema) {
        if (err) {
          next();
        } else {
          // Write out DROP SCHEMA command to drop_all_custom.sql.
          var child = exec("echo 'DROP SCHEMA " + doneSchema + ";' >> backup/drop_all_custom.sql", function (err, res) {
            if (err) {
              console.log("drop_all_custom error", err);
            }
          });

          child.on('exit', function (code) {
            console.log("Custom Schema " + doneSchema + " Backed Up To: ./" + 'backup/' + customClient.connectionParameters.database + "_schemas/" + doneSchema + ".backup");
            if (customSchemasDiff.length === backedUpSchemas.length) {
              // All custom schemas backed up, continue to next step.
              schemasBackedUp = true;
              next();
            } else {
              return;
            }
          });
        }
      };

  // Backup these schemas
  if (customSchemasDiff.length > 0) {
    console.log("Backing Up Custom Schemas: ", customSchemasDiff);

    var schemaMkDir = 'backup/' + customClient.connectionParameters.database + "_schemas";

    prepareDirectory(schemaMkDir, function () {
      // Backup each schema. Note: This is async and will run in parallel.
      _.each(customSchemasDiff, function (schema) {
        backupSchema(customClient, schema, callback);
      });
    });
  } else {
    // No Schemas to backup.
    schemasBackedUp = true;
    next();
  }
};

var backupViews = function (dbClient, next) {
  "use strict";

  var backedUpViews = {
      "def": [],
      "custom": [],
      "overwritten": []
    },
    callback = function (type, doneView) {
      if (type === 'def') {
        backedUpViews.def.push(doneView);
      } else if (type === 'custom') {
        console.log("Custom View " + doneView + " Backed Up To: ./" + 'backup/' + customClient.connectionParameters.database + "_custom_views/" + doneView + ".sql");
        backedUpViews.custom.push(doneView);
      } else if (type === 'overwritten') {
        console.log("Overwritten View " + doneView + " Backed Up To: ./" + 'backup/' + customClient.connectionParameters.database + "_overwritten_views/custom/" + doneView + ".sql");
        backedUpViews.overwritten.push(doneView);
      }

      if (backedUpViews.def.length === defaultViewsDiff.length &&
        backedUpViews.custom.length === customViewsDiff.length &&
        backedUpViews.overwritten.length === overwrittenViewsDiff.length) {

        // Done with Views, move on.
        viewsBackedUp = true;
        next();
      }
    };

  // Build array of schema.table view names.
  views.defaultDb = [];
  views.customDb = [];
  for (var i = 0; i < views.defaultDbDef.length; i++) {
    views.defaultDb.push(views.defaultDbDef[i].table_schema + "." + views.defaultDbDef[i].table_name);
  }
  for (var j = 0; j < views.customDbDef.length; j++) {
    views.customDb.push(views.customDbDef[j].table_schema + "." + views.customDbDef[j].table_name);
  }

  // Loop over views.defaultDb and find ones that are missing from views.customDb.
  customViewsDiff = _.difference(views.customDb, views.defaultDb);
  defaultViewsDiff = _.difference(views.defaultDb, views.customDb);

  // Write missing views to files.
  if (defaultViewsDiff.length) {
    // Create directory.
    console.log("Backing Up Missing Default Views: ", defaultViewsDiff);

    var missingMkDir = 'backup/' + customClient.connectionParameters.database + "_missing_views";

    prepareDirectory(missingMkDir, function () {
      for (var k = 0; k < defaultViewsDiff.length; k++) {
        var saveDefaultView = function (value, nextView) {
          var viewName = value.table_schema + "." + value.table_name;
          if (viewName === defaultViewsDiff[k]) {
            // Write each missing view to file.
            var fileContents = "CREATE OR REPLACE VIEW " +
                  viewName + " AS " + value.view_definition,
                fileName = 'backup/' + customClient.connectionParameters.database + "_missing_views/" +
                  viewName + ".sql";

            formatSql(fileContents, function (formattedFileContents) {
              fs.writeFile(fileName, formattedFileContents, function (err, results) {
                if (err) {
                  console.log(viewName + " error", err);
                }
                callback('def', viewName);
                nextView();
              });
            });
          }
        };

        async.map(views.defaultDbDef, saveDefaultView, function (err, results) {
          // All done!
        });
      }
    });
  }

  // Write custom views to files.
  if (customViewsDiff.length) {
    // Create directory.
    console.log("Backing Up Custom Views: ", customViewsDiff);

    var customMkDir = 'backup/' + customClient.connectionParameters.database + "_custom_views";

    prepareDirectory(customMkDir, function () {
      for (var k = 0; k < customViewsDiff.length; k++) {
        var saveCustomView = function (value, nextView) {
          var viewName = value.table_schema + "." + value.table_name;
          if (viewName === customViewsDiff[k]) {
            // Write each custom view to file.
            var fileContents = "CREATE OR REPLACE VIEW " +
                  viewName + " AS " + value.view_definition,
                fileName = 'backup/' + customClient.connectionParameters.database + "_custom_views/" +
                  viewName + ".sql";

            // Write out DROP VIEW command to drop_all_custom.sql.
            var dropChild = exec("echo 'DROP VIEW " + viewName + ";' >> backup/drop_all_custom.sql", function (err, res) {
              if (err) {
                console.log("drop_all_custom error", err);
              }
            });

            dropChild.on('exit', function (code) {
              return;
            });

            formatSql(fileContents, function (formattedFileContents) {
              fs.writeFile(fileName, formattedFileContents, function (err, results) {
                if (err) {
                  console.log(viewName + " error", err);
                }
                callback('custom', viewName);
                nextView();
              });
            });
          }
        };

        async.map(views.customDbDef, saveCustomView, function (err, results) {
          // All done!
        });
      }
    });
  }

  // Check if the view_definition matches.
  overwrittenViewsDiff = [];
  overwrittenViewsDef = [];
  _.each(views.customDbDef, function (customValue) {
    var customViewName = customValue.table_schema + "." + customValue.table_name;

    // Only check for difference if this is not a custom view.
    if (customViewsDiff.indexOf(customViewName) === -1) {
      _.each(views.defaultDbDef, function (defaultValue) {
        var defaultViewName = defaultValue.table_schema + "." + defaultValue.table_name;

        // Find the matching view name.
        if (customViewName === defaultViewName) {
          // Check if the defaultDbDef view_definition matches to customDbDef view_definition.
          if (customValue.view_definition !== defaultValue.view_definition) {
            console.log("Overwritten default view: ", customViewName);
            overwrittenViewsDiff.push(customViewName);

            overwrittenViewsDef.push({
              'custom_def': customValue.view_definition,
              'default_def': defaultValue.view_definition,
              'view_name': customViewName
            });
          }
        }
      });
    }
  });

  // Write customized default views to files.
  if (overwrittenViewsDiff.length) {
    // Create directory.
    console.log("Overwritten Default Views: ", overwrittenViewsDiff);

    var overMkDir = 'backup/' + customClient.connectionParameters.database + "_overwritten_views",
        overCustomMkDir = 'backup/' + customClient.connectionParameters.database + "_overwritten_views/custom",
        overDefMkDir = 'backup/' + customClient.connectionParameters.database + "_overwritten_views/default";

    prepareDirectory(overMkDir, function () {
      prepareDirectory(overCustomMkDir, function () {
        prepareDirectory(overDefMkDir, function () {
          var saveOverwrittenView = function (value, nextView) {
            // Write each missing view to file.
            var viewName = value.view_name,
                customFileContents = "CREATE OR REPLACE VIEW " +
                  viewName + " AS " + value.custom_def,
                customFileName = 'backup/' + customClient.connectionParameters.database + "_overwritten_views/custom/" +
                  viewName + ".sql",
                defaultFileContents = "CREATE OR REPLACE VIEW " +
                  viewName + " AS " + value.default_def,
                defaultFileName = 'backup/' + customClient.connectionParameters.database + "_overwritten_views/default/" +
                  viewName + ".sql",
                defaultWritten = false,
                customWritten = false,
                saveOverrittenFile = function (saveFileName, formattedFileContents, saveViewName, saveType) {
                  fs.writeFile(saveFileName, formattedFileContents, function (err, results) {
                    if (err) {
                      console.log(saveViewName + " error", err);
                    }

                    if (saveType === 'custom') {
                      customWritten = true;
                    }

                    if (saveType === 'def') {
                      defaultWritten = true;
                    }

                    if (defaultWritten && customWritten) {
                      // Once both files have been written, move on to the next view.
                      callback('overwritten', viewName);
                      nextView();
                    }
                  });
                };

            formatSql(customFileContents, function (formattedFileContents) {
              saveOverrittenFile(customFileName, formattedFileContents, viewName, 'custom');
            });

            formatSql(defaultFileContents, function (formattedFileContents) {
              saveOverrittenFile(defaultFileName, formattedFileContents, viewName, 'def');
            });
          };

          async.map(overwrittenViewsDef, saveOverwrittenView, function (err, results) {
            // All done!
          });
        });
      });
    });
  }
};

/**
 * Backup all custom, missing and overwritten functions.
 */
var backupFunctions = function (dbClient, next) {
  "use strict";

  var backedUpFunctions = {
      "def": [],
      "custom": [],
      "overwritten": []
    },
    callback = function (type, doneFunction) {
      if (type === 'def') {
        backedUpFunctions.def.push(doneFunction);
      } else if (type === 'custom') {
        console.log("Custom Function " + doneFunction + " Backed Up To: ./" + 'backup/' + customClient.connectionParameters.database + "_custom_functions/" + doneFunction + ".sql");
        backedUpFunctions.custom.push(doneFunction);
      } else if (type === 'overwritten') {
        console.log("Overwritten Function " + doneFunction + " Backed Up To: ./" + 'backup/' + customClient.connectionParameters.database + "_overwritten_functions/custom/" + doneFunction + ".sql");
        backedUpFunctions.overwritten.push(doneFunction);
      }

      if (backedUpFunctions.def.length === defaultFunctionsDiff.length &&
        backedUpFunctions.custom.length === customFunctionsDiff.length &&
        backedUpFunctions.overwritten.length === overwrittenFunctionsDiff.length) {

        // Done with Functions, move on.
        functionsBackedUp = true;
        next();
      }
    };

  // Build array of schema.table function names.
  functions.defaultDb = [];
  functions.customDb = [];
  for (var i = 0; i < functions.defaultDbDef.length; i++) {
    functions.defaultDb.push(functions.defaultDbDef[i].func_schema + '.' + functions.defaultDbDef[i].func_name + '(' + functions.defaultDbDef[i].func_args + ')');
  }
  for (var j = 0; j < functions.customDbDef.length; j++) {
    functions.customDb.push(functions.customDbDef[j].func_schema + '.' + functions.customDbDef[j].func_name + '(' + functions.customDbDef[j].func_args + ')');
  }

  // Loop over functions.defaultDb and find ones that are missing from functions.customDb.
  customFunctionsDiff = _.difference(functions.customDb, functions.defaultDb);
  defaultFunctionsDiff = _.difference(functions.defaultDb, functions.customDb);

  // Write missing functions to files.
  if (defaultFunctionsDiff.length) {
    // Create directory.
    console.log("Backing Up Missing Default Functions: ", defaultFunctionsDiff);

    var missingMkDir = 'backup/' + customClient.connectionParameters.database + "_missing_functions";

    prepareDirectory(missingMkDir, function () {
      for (var k = 0; k < defaultFunctionsDiff.length; k++) {
        var saveDefaultFunction = function (value, nextFunction) {
          var functionName = value.func_schema + '.' + value.func_name + '(' + value.func_args + ')';
          if (functionName === defaultFunctionsDiff[k]) {
            // Write each missing function to file.
            var fileContents = value.func_definition,
                fileName = 'backup/' + customClient.connectionParameters.database + "_missing_functions/" +
                  functionName + ".sql";

            // We do not need to formatSql() the functions.
            fs.writeFile(fileName, fileContents, function (err, results) {
              if (err) {
                console.log(functionName + " error", err);
              }
              callback('def', functionName);
              nextFunction();
            });
          }
        };

        async.map(functions.defaultDbDef, saveDefaultFunction, function (err, results) {
          // All done!
        });
      }
    });
  }

  // Write custom functions to files.
  if (customFunctionsDiff.length) {
    // Create directory.
    console.log("Backing Up Custom Functions: ", customFunctionsDiff);

    var customMkDir = 'backup/' + customClient.connectionParameters.database + "_custom_functions";

    prepareDirectory(customMkDir, function () {
      for (var k = 0; k < customFunctionsDiff.length; k++) {
        var saveCustomFunction = function (value, nextFunction) {
          var functionName = value.func_schema + '.' + value.func_name + '(' + value.func_args + ')';
          if (functionName === customFunctionsDiff[k]) {
            // Write each custom function to file.
            var fileContents = value.func_definition,
                fileName = 'backup/' + customClient.connectionParameters.database + "_custom_functions/" +
                  functionName + ".sql";

            // Write out DROP VIEW command to drop_all_custom.sql.
            var dropChild = exec("echo 'DROP FUNCTION " + functionName + ";' >> backup/drop_all_custom.sql", function (err, res) {
              if (err) {
                console.log("drop_all_custom error", err);
              }
            });

            dropChild.on('exit', function (code) {
              return;
            });

            // We do not need to formatSql() the functions.
            fs.writeFile(fileName, fileContents, function (err, results) {
              if (err) {
                console.log(functionName + " error", err);
              }
              callback('custom', functionName);
              nextFunction();
            });
          }
        };

        async.map(functions.customDbDef, saveCustomFunction, function (err, results) {
          // All done!
        });
      }
    });
  }

  // Check if the func_definition matches.
  overwrittenFunctionsDiff = [];
  overwrittenFunctionsDef = [];
  _.each(functions.customDbDef, function (customValue) {
    var customFunctionName = customValue.func_schema + '.' + customValue.func_name + '(' + customValue.func_args + ')';

    // Only check for difference if this is not a custom function.
    if (customFunctionsDiff.indexOf(customFunctionName) === -1) {
      _.each(functions.defaultDbDef, function (defaultValue) {
        var defaultFunctionName = defaultValue.func_schema + '.' + defaultValue.func_name + '(' + defaultValue.func_args + ')';

        // Find the matching function name.
        if (customFunctionName === defaultFunctionName) {
          // Check if the defaultDbDef func_definition matches to customDbDef func_definition.
          if (customValue.func_definition !== defaultValue.func_definition) {
            console.log("Overwritten default function: ", customFunctionName);
            overwrittenFunctionsDiff.push(customFunctionName);

            overwrittenFunctionsDef.push({
              'custom_def': customValue.func_definition,
              'default_def': defaultValue.func_definition,
              'function_name': customFunctionName
            });
          }
        }
      });
    }
  });

  // Write customized default functions to files.
  if (overwrittenFunctionsDiff.length) {
    // Create directory.
    console.log("Overwritten Default Functions: ", overwrittenFunctionsDiff);

    var overMkDir = 'backup/' + customClient.connectionParameters.database + "_overwritten_functions",
        overCustomMkDir = 'backup/' + customClient.connectionParameters.database + "_overwritten_functions/custom",
        overDefMkDir = 'backup/' + customClient.connectionParameters.database + "_overwritten_functions/default";

    prepareDirectory(overMkDir, function () {
      prepareDirectory(overCustomMkDir, function () {
        prepareDirectory(overDefMkDir, function () {
          var saveOverwrittenFunction = function (value, nextFunction) {
            // Write each missing function to file.
            var functionName = value.function_name,
              customFileContents = "CREATE OR REPLACE VIEW " +
                functionName + " AS " + value.custom_def,
              customFileName = 'backup/' + customClient.connectionParameters.database + "_overwritten_functions/custom/" +
                functionName + ".sql",
              defaultFileContents = "CREATE OR REPLACE VIEW " +
                functionName + " AS " + value.default_def,
              defaultFileName = 'backup/' + customClient.connectionParameters.database + "_overwritten_functions/default/" +
                functionName + ".sql",
              defaultWritten = false,
              customWritten = false,
              saveOverrittenFile = function (saveFileName, formattedFileContents, saveFunctionName, saveType) {
                fs.writeFile(saveFileName, formattedFileContents, function (err, results) {
                  if (err) {
                    console.log(saveFunctionName + " error", err);
                  }

                  if (saveType === 'custom') {
                    customWritten = true;
                  }

                  if (saveType === 'def') {
                    defaultWritten = true;
                  }

                  if (defaultWritten && customWritten) {
                    // Once both files have been written, move on to the next function.
                    callback('overwritten', functionName);
                    nextFunction();
                  }
                });
              };

            // We do not need to formatSql() the functions.
            saveOverrittenFile(customFileName, customFileContents, functionName, 'custom');
            saveOverrittenFile(defaultFileName, defaultFileContents, functionName, 'def');
          };

          async.map(overwrittenFunctionsDef, saveOverwrittenFunction, function (err, results) {
            // All done!
          });
        });
      });
    });
  }
};

/**
 * Main application function to perform all steps.
 */
var application = function () {
  "use strict";

  if (!schemas.customDb) {
    // Initialize the drop_all_custom.sql file.

    var backupDir = 'backup';

    prepareDirectory(backupDir, function () {
      var child = exec("echo 'BEGIN;' > backup/drop_all_custom.sql", function (err, res) {
        if (err) {
          console.log("drop_all_custom error", err);
        }
      });

      child.on('exit', function (code) {
        initCustom();
      });
    });
  } else if (!schemas.defaultDb) {
    initDefault();
  } else if (!views.customDbDef) {
    customSchemasDiff = _.difference(schemas.customDb, schemas.defaultDb);
    defaultSchemasDiff = _.difference(schemas.defaultDb, schemas.customDb);

    setCustomViews();
  } else if (!views.defaultDbDef) {
    setDefaultViews();
  } else if (!viewsBackedUp) {
    // Check if there are any custom views to backup.
    backupViews(customDbName, application);
  } else if (!functions.defaultDbDef) {
    setDefaultFunctions();
  } else if (!functions.customDbDef) {
    setCustomFunctions();
  } else if (!functionsBackedUp) {
    // Check if there are any custom functions to backup.
    backupFunctions(customDbName, application);
  } else if (!schemasBackedUp) {
    // Check if there are any custom schemas to backup.
    backupSchemas(customDbName, application);
  } else {

    // TODO: Split backupFunctions into backupFunctions and backupTriggers based on func_type.

    // Write out DROP COMMIT command to drop_all_custom.sql.
    var dropChild = exec("echo 'COMMIT;' >> backup/drop_all_custom.sql", function (err, res) {
      if (err) {
        console.log("drop_all_custom error", err);
      }
    });

    dropChild.on('exit', function (code) {
      return;
    });

    console.log("Done");
    customClient.end();
    defaultClient.end();
    return;
  }
};

// Call the main application function the does everything.
application();
