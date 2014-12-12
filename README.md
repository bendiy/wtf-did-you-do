wtf-did-you-do
==============

Figure out what custom changes you made to an xTuple database.

This is a simple Node.js app that allows you to compare a standard default
xTuple database against your database and find out what changes you have made.
This app will look for any custom, missing, or overwritten Views and Functions.
It will also backup all Schemas in your database that do not exist in the
default xTuple database. This app will write out a DROP statement for all
Schemas, Views and Functions that are custom to `drop_all_custom.sql`.

Install the App
---------------
    git clone git://github.com/bendiy/wtf-did-you-do.git
    cd wtf-did-you-do
    npm install
    # Or run that as root if you have problems.
    # sudo npm install

Configure the App
-----------------
    # Copy the sample_config.js to config.js
    cp sample_config.js config.js
    # Use your favorite text editor to modify the config.js file.
    # Using Vi to edit the config file:
    vi config.js
Modify the config.js file to connect to your databases and specify if you want
to run the sql files created by this app through [sqlformat.org's API](http://sqlformat.org/).

Setup the default xTuple database
---------------------------------
This app will look at one default xTuple database and compare it to your custom
database. To ensure best result it is recommended you create a default xTuple
database that is on the same release and version of xTuple as your custom
database.

For example, if your custom database is on xTuple release "Distribution" and
version "4.3.0", you should create the default xTuple database with the same
release and version; "Distribution" "4.3.0". This default xTuple database
should be a restored copy of xTuple's "demo", "quickstart" or "masterRef"
database.

If you have the xTuple Mobile Client/Server installed on your custom database,
you should also install it on the default xTuple database so the comparison is
more accurate. Be sure to install any Mobile Extensions on the default xTuple
database that you have in your custom database.

The goal is to make the default xTuple database as close to a fresh install of
your custom database as possible. This will reduce the number of changes this
app will find to just the important stuff.

Make sure PostgreSQL is configured to connect
---------------------------------------------
You may need to edit you pg_hba.conf file or add a `.pgpass` file to this
directory to ensure the app will run without prompting you for a password.
It should still work fine, but you will be prompted to enter your postgres
password once for each schema it backups up. You can avoid this with a
`.pgpass` file or allowing access in pg_hba.conf.

Please see these sites for more details:

http://www.postgresql.org/docs/current/static/libpq-pgpass.html

http://www.postgresql.org/docs/9.3/static/auth-pg-hba-conf.html

Run the App
-----------
    node app.js

Log messages will be output to the console. Everything this app finds will be
backup up to `./backup/`. Each time you run this app, the `./backup/` direcotry
and all of it's contents will be removed. Make sure you copy the `./backup/`
direcotry to a safe location before running this app again.

This app will not modify either database. The commands in
`./backup/drop_all_custom.sql` can be ran to remove all custom objects from
your custom database. This is very useful if you are having issues upgrading
your custom database. However, it is very likely that PostgreSQL will complain
of referenced dependencies when dropping these objects. You will most likely
need to re-order the DROP statements in the `drop_all_custom.sql` to drop them
all cleanly at once. For example, you may find that you do not need to drop any
of your custom function for the upgrade to work.  You will also need t add
`CASCADE` to the DROP SCHEMA statements if you really want to remove them:

    DROP SCHEMA myschema CASCADE;

Example Output
--------------
Here is an example of the output this app will generate if you run the
`tree backup\` command.

    backup/
    +-- mydb_custom_functions
    ¦   +-- public.createplannedorder(integer, integer, integer, numeric, date, date, boolean, boolean, integer, text, text, integer).sql
    ¦   +-- public.defaultps(integer, integer).sql
    ¦   +-- public.defaultps(integer).sql
    ¦   +-- public.freightcost(integer).sql
    ¦   +-- public.getactcost(integer, date).sql
    ¦   +-- public.temp(integer, integer).sql
    +-- mydb_custom_views
    ¦   +-- public.invhist_month.sql
    ¦   +-- public.invhist_week.sql
    ¦   +-- public.inv_var.sql
    ¦   +-- public.itemconv.sql
    ¦   +-- public.last_two_po.sql
    ¦   +-- public.margin.sql
    ¦   +-- public.rpt_saleshist_invc_detail.sql
    ¦   +-- public.rpt_saleshistsum_detail.sql
    +-- mydb_missing_functions
    ¦   +-- public.armor(bytea).sql
    ¦   +-- public.crypt(text, text).sql
    ¦   +-- public.dearmor(text).sql
    ¦   +-- public.decrypt(bytea, bytea, text).sql
    ¦   +-- public.decrypt_iv(bytea, bytea, bytea, text).sql
    ¦   +-- public.digest(bytea, text).sql
    ¦   +-- public.digest(text, text).sql
    ¦   +-- public.encrypt(bytea, bytea, text).sql
    ¦   +-- public.encrypt_iv(bytea, bytea, bytea, text).sql
    ¦   +-- public.gen_salt(text, integer).sql
    ¦   +-- public.gen_salt(text).sql
    ¦   +-- public.hmac(bytea, bytea, text).sql
    ¦   +-- public.hmac(text, text, text).sql
    ¦   +-- public.pgp_key_id(bytea).sql
    +-- mydb_overwritten_functions
    ¦   +-- custom
    ¦   ¦   +-- public.insertsalesline(api.salesline).sql
    ¦   ¦   +-- public.saveipsitem(integer, integer, integer, numeric, numeric, integer, integer).sql
    ¦   ¦   +-- public.saveipsprodcat(integer, integer, integer, numeric, numeric, numeric).sql
    ¦   ¦   +-- public.updateprice(integer, character, numeric).sql
    ¦   ¦   +-- public.updateprice(integer, numeric).sql
    ¦   +-- default
    ¦       +-- public.insertsalesline(api.salesline).sql
    ¦       +-- public.saveipsitem(integer, integer, integer, numeric, numeric, integer, integer).sql
    ¦       +-- public.saveipsprodcat(integer, integer, integer, numeric, numeric, numeric).sql
    ¦       +-- public.updateprice(integer, character, numeric).sql
    ¦       +-- public.updateprice(integer, numeric).sql
    +-- mydb_overwritten_views
    ¦   +-- custom
    ¦   ¦   +-- public.address.sql
    ¦   ¦   +-- public.saleshistorymisc.sql
    ¦   ¦   +-- public.saleshistory.sql
    ¦   +-- default
    ¦       +-- public.address.sql
    ¦       +-- public.saleshistorymisc.sql
    ¦       +-- public.saleshistory.sql
    +-- mydb_schemas
    ¦   +-- audit.backup
    ¦   +-- mydb.backup
    ¦   +-- custom_integration.backup
    ¦   +-- custom_label.backup
    ¦   +-- pre380.backup
    +-- drop_all_custom.sql

    10 directories, 50 files


## Credits

  - [bendiy](http://github.com/bendiy)

## License

[The MIT License](http://opensource.org/licenses/MIT)

Copyright (c) 2012-2013 xTuple [http://www.xtuple.com/](http://www.xtuple.com/)
