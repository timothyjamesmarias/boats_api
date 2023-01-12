const express = require('express');
const bodyParser = require('body-parser');
const json2html = require('json-to-html');
const { auth } = require('express-openid-connect');
const router = express.Router();
const ds = require('./datastore');

const datastore = ds.datastore;

const BOAT = "Boat";
const LOAD = "Load";

//Auth0

const config = {
    authRequired: false,
    auth0Logout: true,
    baseURL: process.env.URL,
    clientID: process.env.CLIENT_ID,
    issuerBaseURL: process.env.ISSUER_URL,
    secret: process.env.CLIENT_SECRET
};


router.use(bodyParser.json());
router.use(auth(config));

//model functions

function post_boat(name, type, length, self_url, public, owner){
    var key = datastore.key(BOAT);
    const self = self_url + key;
    const new_boat = {"name": name, "type": type, "length": length, "self": self, "public": public, "owner": owner};
    return datastore.save({"key": key, "data": new_boat}).then(() => {
        return key
    });
}

function delete_boat(id){
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.delete(key);
}

function get_boats(req, owner){
    const query = datastore.createQuery(BOAT).limit(5);
    const results = {};
    var prev;
    if (Object.keys(req.query).includes("cursor")){
        prev = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + req.query.cursor;
        q = q.start(req.query.cursor);   
    }
    return datastore.runQuery(query).then((entities) =>{
        results.items = entities[0].map(ds.fromDatastore).filter(item => item.owner === owner);
        if(typeof prev !== 'undefined'){
            results.previous = prev;
        }
        if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULT){
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        return results;
    });
}

function get_boats_unprotected(req){
    const query = datastore.createQuery(BOAT).limit(5);
    const results = {};
    var prev;
    if (Object.keys(req.query).includes("cursor")){
        prev = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + req.query.cursor;
        q = q.start(req.query.cursor);   
    }
    return datastore.runQuery(query).then((entities) =>{
        results.items = entities[0].map(fromDatastore).filter(item => item.public === true);
        if(typeof prev !== 'undefined'){
            results.previous = prev;
        }
        if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULT){
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        return results;
    });
}

function get_boats_all(){
    const query = datastore.createQuery(BOAT);
    return datastore.runQuery(query).then((entities) =>{
        results.items = entities[0].map(fromDatastore);
        return results;
    });
}

function get_boat(id){
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null){
            return entity;
        }
        else {
            return entity.map(fromDatastore);
        }
    });
}

function put_boat(id, name, type, length, public){
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    const boat = {"name": name, "type": type, "length": length, "public": public};
    return datastore.save({"key": key, "data": boat});
}

function patch_boat(id, data){
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.save({"key": key, "data": data});
}

function add_load_to_boat(bid, lid){
    const b_key = datastore.key([BOAT, parseInt(bid,10)]);
    return datastore.get(b_key)
    .then( (boat) => {
        if( typeof(boat[0].loads) === 'undefined'){
            boat[0].loads = [];
        }
        boat[0].loads.push(lid);
        return datastore.save({"key":b_key, "data":load[0]});
    });
}

function remove_load_from_boat(bid, lid){
    const b_key = datastore.key([BOAT, parseInt(bid,10)]);
    return datastore.get(b_key)
    .then( (boat) => {
        if( typeof(boat[0].loads) === 'undefined'){
            return datastore.save({"key": b_key});
        }
        else{
            const loads = boat[0].loads;
            const index = loads.indexOf(lid);

            loads.splice(index, lid);

            return datastore.save({"key":b_key, "data": loads});
        }
    });
}

function get_boat_loads(id){
    const key = datastore.key([BOAT, parseInt(id,10)]);
    return datastore.get(key)
    .then(boats =>{
        const boat = boats[0];
        const loads = boat.loads.map(lid =>{
            return datastore.key([LOAD, parseInt(l_id,10)]);
        });
    })
    .then(loads =>{
        loads = loads[0].map(ds.fromDatastore);
        return loads;
    })
}

//controller functions

//get boats
router.get('/', function(req, res){
    if (req.oidc.isAuthenticated){
        const boats = get_boats(req, req.oidc.user)
        .then(boats => {
            res.status(200).json(boats);
        });
    }
    else{
        const boats = get_boats_unprotected(req)
        .then(boats => {
            res.status(200).json(boats);
        });
    }
});

//get a single boat
router.get('/:id', function(req,res){
    if (req.oidc.isAuthenticated){
        const boat = get_boat(req.params.id)
        .then(boat =>{
            const accepts = req.accepts(['application/json', 'text/html']);
            if( boat.owner !== req.oidc.user){
                res.status(403).json('Forbidden');
            } else if(!accepts){
                res.status(406).json('Not Acceptable');
            } else if(accepts === 'application/json'){
                res.status(200).json(boat);
            } else if(accepts === 'text/html'){
                res.status(200).send(json2html(boat).slice(1,-1));
            } else { res.status(500).send('Content type got messed up!'); }
        });
    }
    else{
        res.status(401).json("Not authenticated");
    }    
});

//post single boat
router.post('/', function(req, res){
    if (req.oidc.isAuthenticated){
        if(req.get('content-type') !== 'application/json'){
            res.status(415).send('Server only accepts application/json data.');
        }
        else if(req.body.name && req.body.type && req.body.length){
            const boats = get_boats_all();
            var is_unique = true; 
            for (let i = 0; i < boats.length(); i++){
                if (boats[i].name === req.body.name){
                    is_unique = false;
                    res.status(403).json('Boat must have a unique name.');
                    break;
                }
            }
            if (is_unique === true){
                const self_url = req.protocol + "://" +  req.get('host') + req.baseUrl + '/';
                var public;
                if (req.body.public == null || req.body.public == undefined){
                    public = true;
                }
                else{
                    public = req.body.public;
                }
                post_boat(req.body.name, req.body.type, req.body.length, self_url, public, req.oidc.user)
                .then(boat => {
                    res.status(201).json(boat);
                } );
            }
        }
        else {
            res.status(400).json('Request missing one or more attributes.');
        }    
    }
    else{
        res.status(401).json('Not authenticated');
    }
});

//edit a boat
router.put('/:id', function(req, res){
    if (req.oidc.isAuthenticated){
        get_boat(req.params.id)
            .then(boat =>{
                if (boat[0] === undefined || boat[0] === null) {
                    res.status(404).json( 'Error No boat with this id exists' );
                }
                else if (req.oidc.user !== boat.owner){
                    res.status(403).json("Forbidden");
                }
                else{
                    if(req.body.name === undefined || req.body.type === undefined || req.body.length === undefined){
                        res.status(400).json( 'Error The request object is missing at least one of the required attributes' );
                    }
                    else{
                        put_boat(req.params.id, req.body.name, req.body.type, req.body.length); 
                        res.status(200).json(boat);
                    }
                }
            });
    }
    else{
        res.status(401).json('Not authenticated');
    }
});

//delete a boat
router.delete('/:id', function(req, res){
    const boat = get_boat(req.body.id)
    .then(boat =>{
        if (req.oidc.isAuthenticated){
            if (boat.id === null || boat.id === undefined){
                res.status(404).json("Boat with this id not found");
            }
            else if (boat.owner !== req.oidc.user){
                res.status(403).json("Forbidden");
            }
            else{
                delete_boat(req.body.id);
                res.status(204).end();
            }    
        }
        else{
            res.status(401).json('Not authenticated');
        }
    });
});

router.get('/:bid/loads', function(req, res){
    if (req.oidc.isAuthenticated){
        const boat = get_boat(req.params.bid);
        if (boat[0] === undefined || boat[0] === null) {
            res.status(404).json( 'Error No boat with this id exists' );
        }
        else if (req.oidc.user !== boat.owner){
            res.status(403).json('Forbidden');
        }
        else{
            if (boat.loads === null || boat.loads === undefined){
                res.status(403).json("Boat has no loads present.");
            }
            else{
                loads = get_boat_loads(req.params.bid)
                .then(loads =>{
                    res.status(200).json(loads);
                });
            }
        }
    }
    else{
        res.status(401).json('Not Authenticated.');
    }

});

router.put('/:bid/loads/:lid', function(req, res){
    if (req.oidc.isAuthenticated){
        const boat = get_boat(req.params.bid);
        if (boat.id === null || boat.id === undefined){
            res.status(404).json("Boat with this id not found");
        }
        else if (req.oidc.user !== boat.owner){
            res.status(403).json('Forbidden');
        }
        else{
            const all_boats = get_boats_all();
            var already_loaded = false;
            for (let i = 0; i < all_boats.length; i++) {
                const loads = all_boats[i].loads;
                if (loads != null || loads != undefined){
                    for (let j = 0; j < loads.length; j++) {
                        if (loads[j] === req.params.lid){
                            already_loaded = true;
                        }                        
                    }
                }
            }
            if (already_loaded){
                res.status(403).json("Load already on a boat.");
            }
            else{
                add_load_to_boat(req.params.bid, req.params.lid)
                .then(boat => {
                    res.status(204).end();
                });
            }
        }
    }
    else{
        res.status(401).json('Not Authenticated.');
    }
});

router.delete('/:bid/loads/:lid', function(req, res){
    if (req.oidc.isAuthenticated){
        const boat = get_boat(req.params.bid);
        if (boat.id === null || boat.id === undefined){
            res.status(403).json("Boat with this id not found");
        }
        else if (req.oidc.user !== boat.owner){
            res.status(403).json('Forbidden');
        }
        else{
            if (boat.loads === undefined || boat.loads === null){
                res.status(403).json("Boat has no loads present.");
            }
            else{
                var load_present = false;
                for(let i = 0; i < boat.loads.length; i++){
                    if(loads[i] === req.params.lid){
                        load_present = true;
                        break;
                    }
                }
                if(load_present){
                    remove_load_from_boat(req.params.bid, req.params.lid)
                    .then(boat => {
                        res.status(204).end();
                    });
                }    
                else{
                    res.status(403).json("Load not present in boat.");
                }
            }
        }
    }
    else{
        res.status(401).json('Not Authenticated.');
    }
});

router.delete('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).end();
});

router.put('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).end();
});

router.patch('/', function(req, res){
    res.set('Accept', 'GET', 'POST');
    res.status(405).end();
});


module.exports = router;