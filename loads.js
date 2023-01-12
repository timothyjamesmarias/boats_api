const express = require('express');
const bodyParser = require('body-parser');
const json2html = require('json-to-html');
const { auth } = require('express-openid-connect');
const router = express.Router();
const ds = require('./datastore');

const datastore = ds.datastore;

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
function post_load(volume, weight, cost, self_url, public, owner){
    var key = datastore.key(LOAD);
    const self = self_url + key;
	const load = {"volume": volume, "weight": weight, "cost": cost, "self": self, "public": public, "owner": owner};
	return datastore.save({"key":key, "data": load}).then(() => {return key});
}

function get_load(id){
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null){
            return entity;
        }
        else {
            return entity.map(fromDatastore);
        }
    });
}

function put_load(id, volume, weight, cost, public){
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    const load = {"volume": volume, "weight": weight, "cost": cost, "public": public};
    return datastore.save({"key": key, "data": load});

}

function get_loads(req, owner){
    var q = datastore.createQuery(LOAD).limit(5);
    const results = {};
    var prev;
    if(Object.keys(req.query).includes("cursor")){
        prev = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + req.query.cursor;
        q = q.start(req.query.cursor);
    }
	return datastore.runQuery(q).then( (entities) => {
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

function get_loads_unprotected(req){
    var q = datastore.createQuery(LOAD).limit(5);
    const results = {};
    var prev;
    if(Object.keys(req.query).includes("cursor")){
        prev = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + req.query.cursor;
        q = q.start(req.query.cursor);
    }
	return datastore.runQuery(q).then( (entities) => {
        results.items = entities[0].map(ds.fromDatastore).filter(item => item.public === true);
        if(typeof prev !== 'undefined'){
            results.previous = prev;
        }
        if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULT){
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        return results;
	});
}

function delete_load(id){
    const key = datastore.key([LOAD, parseInt(id,10)]);
    return datastore.delete(key);
}

//controller functions

router.get('/', function(req, res){
    if (req.oidc.isAuthenticated){
        const loads = get_loads(req, req.oidc.user)
        .then(loads => {
            res.status(200).json(loads);
        });
    }
    else{
        const loads = get_loads_unprotected(req)
        .then(loads => {
            res.status(200).json(loads);
        });
    }
});

//get a single load
router.get('/:id', function(req,res){
    if (req.oidc.isAuthenticated){
        const load = get_load(req.params.id)
        .then(load =>{
            const accepts = req.accepts(['application/json', 'text/html']);
            if(load.owner !== req.oidc.user){
                res.status(403).json('Forbidden');
            } else if(!accepts){
                res.status(406).json('Not Acceptable');
            } else if(accepts === 'application/json'){
                res.status(200).json(load);
            } else if(accepts === 'text/html'){
                res.status(200).send(json2html(load).slice(1,-1));
            } else { res.status(500).send('Content type got messed up!'); }
        });
    }
    else{
        res.status(401).json("Not authenticated");
    }  
});

router.post('/', function(req, res){
    
    if (req.oidc.isAuthenticated){
        if(req.get('content-type') !== 'application/json'){
            res.status(415).send('Server only accepts application/json data.')
        }
        else if(req.body.volume && req.body.weight && req.body.cost){
            const self_url = req.protocol + "://" +  req.get('host') + req.baseUrl + '/';
            var public;
            if (req.body.public == null){
                public = true;
            }
            else{
                public = req.body.public;
            }
            post_load(req.body.volume, req.body.weight, req.body.cost, self_url, public, req.oidc.user)
            .then(boat => {
                res.status(201).json(boat);
            });

        }
        else {
            res.status(400).json('Request missing one or more attributes.');
        }
    }
    else{
        res.status(401).json('Not Authenticated.');
    }
});

router.delete('/:id', function(req, res){
    const load = get_load(req.body.id)
    .then(load =>{
        if (req.oidc.isAuthenticated){
            if (load.id === null || load.id === undefined){
                res.status(404).json("Load with this id not found");
            }
            else if (load.owner !== req.oidc.user){
                res.status(403).json("Forbidden");
            }
            else{
                delete_load(req.body.id);
                res.status(204).end();
            }    
        }
        else{
            res.status(401).json('Not authenticated');
        }
    });
});

router.put('/:id', function(req, res){
    if (req.oidc.isAuthenticated){
        get_load(req.params.id)
            .then(load =>{
                if (load[0] === undefined || load[0] === null) {
                    res.status(404).json( 'Error No boat with this id exists' );
                }
                else if(req.body.volume === undefined || req.body.weight === undefined || req.body.cost === undefined || req.body.public === undefined){
                    res.status(400).json( 'Error The request object is missing at least one of the required attributes' );
                }
                else{
                    put_load(req.params.id, req.body.name, req.body.type, req.body.length, req); 
                    res.status(200).json(boat);
                }
            });
    }
    else{
        res.status(401).json('Not authenticated');
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