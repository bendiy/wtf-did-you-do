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
    git clone git://github.com/xtuple/wtf-did-you-do.git
    npm install
    # Or run that as root if you have problems.
    # sudo npm install
    cd wtf-did-you-do

Configure the App
-----------------
    # Copy the sample_config.js to config.js
    cp sample_config.js config.js
    # Use your favorite text editor to modify the config.js file.
    # Using Vi to edit the config file:
    vi config.js
Modify the config.js file to connect to your databases and specify if you want
to run the sql files created by this app through sqlformat.org's API.

Setup the default xTuple database
---------------------------------
This app will look at one default xTuple database and compare it to your custom
database. To ensure best result is it recommended you create a default xTuple
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

Run the App
-----------
    node app.js

Log messages will be output to the console. Everything this app finds will be
backup up to `./backup/`. Each time you run this app, the `./backup/` direcotry
and all of it's contents will be removed. Make sure you copy the `./backup/`
direcotry to a safe location before running this app again.

This app will not modify either database. The commands in
`./backup/drop_all_custom.sql` can be ran to remove all custom objects from
your custom database. However, it is very likely that PostgreSQL will complain
of referenced dependencies when dropping these objects. You will most likely
need to re-order the DROP statements in the `drop_all_custom.sql` to drop them
all cleanly at once.

## Credits

  - [bendiy](http://github.com/bendiy)

## License

[The MIT License](http://opensource.org/licenses/MIT)

Copyright (c) 2012-2013 xTuple [http://www.xtuple.com/](http://www.xtuple.com/)
