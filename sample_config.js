/*jshint node:true, indent:2, curly:false, eqeqeq:true, immed:true, latedef:true, newcap:true, noarg:true,
regexp:true, undef:true, strict:true, trailing:true, white:true */
/*global */

(function () {
  "use strict";

  var config = {
    customDb: {
      user: 'admin',
      password: 'admin',
      database: 'your-db-name-here',
      host: 'localhost',
      port: 5432
    },
    defaultDb: {
      user: 'admin',
      password: 'admin',
      database: 'your-xtuple_default-db-name-here',
      host: 'localhost',
      port: 5432
    },
    skipSchemas: ['xm', 'xt', 'sys', 'xtbatch'],
    // Set to true to run sql files through sqlformat.org's API.
    // Note: the sqlformat.org API only supports 500 req per day.
    // @See: http://sqlformat.org/api/
    sqlFormat: false
  };

  module.exports = config;
}());
