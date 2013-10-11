/*
 * grunt-dcl-resources
 * https://github.com/jsmarkus/grunt-dcl-resources
 *
 * Copyright (c) 2013 jsmarkus
 * Licensed under the MIT license.
 */

'use strict';

var dgraph = require('dgraph');
var fs = require('fs');
var path = require('path');
var through = require('through');

//will be ignored
var _builtinLibs = ['assert', 'buffer', 'child_process', 'cluster',
    'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https', 'net',
    'os', 'path', 'punycode', 'querystring', 'readline', 'stream',
    'string_decoder', 'tls', 'tty', 'url', 'util', 'vm', 'zlib', 'smalloc'
];

module.exports = function(grunt) {

    var cwd = process.cwd();

    grunt.registerMultiTask('dcl_resources', 'Bundle resources for DCL', function() {
        var options = this.options();
        var entry = options.entry;
        var dir = options.dir;
        var lessFiles = [];
        var resourceFiles = [];

        var done = this.async();

        function normalize(dir, file) {
            file = path.join(dir, file);
            if (0 === file.indexOf(cwd)) {
                return path.relative(cwd, file);
            } else {
                console.log('out of cwd');
                throw new Error('out of cwd');
            }
        }

        function onDgraphModule(mod) {
            var id = mod.id;
            var pack = mod.package;
            if (mod.deps) {
                delete mod.deps.dual;
            }

            this.queue(mod);
            if (pack && pack.dcl) {
                var res = pack.dcl.resources;
                var less = pack.dcl.less;
                var dir = path.dirname(id);

                if (less) {
                    if(!Array.isArray(less)) {
                        less = [less];
                    }
                    less.forEach(function (less) {
                        console.log(less);
                        var lessFile = normalize(dir, less);
                        lessFiles.push(lessFile);
                    });
                }

                res && res.length && res.forEach(function(item) {
                    resourceFiles.push(normalize(dir, item));
                });
            }
        }

        function onDgraphEnd() {
            copyResources();
            packLess();
            done();
        }

        function onDgraphError(e) {
            var msg;
            if (e.code === 'ENOENT') {
                msg = 'Could not resolve dependency "' + e.path + '".';
                msg += ' You may try to ignore this module and run the task again.'; //TODO: how?
            } else {
                msg = e.toString();
            }
            grunt.fatal(msg);
        }

        function dgraphFilter(id) {
            if (-1 !== _builtinLibs.indexOf(id)) {
                return false;
            }
            return true;
        }

        function copyResources() {
            resourceFiles.forEach(function(file) {
                var to = path.join(dir, file);
                grunt.file.copy(file, to);
            });
        }

        function packLess() {
            var importLess = path.join(dir, 'imports.less');

            var importLessContent = lessFiles.map(function(file) {
                var base = '@base:' + JSON.stringify(path.dirname(file)) + ';';
                var imp = '@import ' + JSON.stringify(file) + ';';
                return [base, imp].join('\n');
            }).join('\n');

            grunt.file.write(importLess, importLessContent);
        }


        //------------------------------------------------------------
        var stream = dgraph(entry, {
            filter: dgraphFilter
        });
        stream.on('error', onDgraphError);
        stream.pipe(through(onDgraphModule, onDgraphEnd));

    });

};