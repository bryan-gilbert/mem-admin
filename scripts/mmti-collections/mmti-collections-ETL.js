'use strict';

//
// Get the API host and session ID from the command line. For example,
//
//   node mmti-collections-ETL.js mem-admin-dev.pathfinder.gov.bc.ca s%3Asls3VeZJA3yS5KdnNXHY_PuXVB1TxTND.TIB3XwtrJBjlvaWnsJEcfaMKVtMm5TFWAi8YUEcN910
//

var apiHost = 'http://' + (process.argv[2] || 'localhost:4000');
var cookie  = 'sessionId=' + process.argv[3];
var test    = process.argv[4] === 'test';

var Promise      = require('es6-promise').Promise;
var RequestRetry = require('requestretry');
var _            = require('lodash');

console.log('Importing MMTI Collections');
console.log('--------------------------');

var api = function(url, type, name, body) {
	return new Promise(function(resolve, reject) {
		RequestRetry({
			url           : apiHost + '/api/' + url,
			method        : body ? 'POST' : 'PUT',
			body          : body || {},
			json          : true,
			maxAttempts   : 25,
			retryDelay    : 5000,
			retryStrategy : RequestRetry.RetryStrategies.HTTPOrNetworkError,
			headers       : {
				'User-Agent' : 'request',
				'Cookie'     : cookie
			}
		}, function(err, res, body) {
			var description = type + ' "' + name + '"';
			if (err) {
				console.log(': Error adding ' + description + err);
				resolve();
			} else if (res.statusCode != 200) {
				console.log(': ' + res.statusCode + ' while adding ' + description);
				resolve();
			} else if (!body) {
				console.log(': Failed to add ' + description);
				resolve();
			} else {
				console.log(': Successfully added ' + description);
				resolve(body);
			}
		});
	});
}

var addCollection = function(collection, projectCode) {
	return api('collections/project/' + projectCode + '/add', 'collection', collection.displayName, collection);
}

var addMainDocument = function(documentId, collectionId) {
	return api('collections/' + collectionId + '/document/' + documentId + '/main/add', 'document', documentId);
}

var addOtherDocument = function(documentId, collectionId) {
	return api('collections/' + collectionId + '/document/' + documentId + '/add', 'document', documentId);
}

var add = function(projectCode, collection, followUpDocuments) {
	console.log('Adding collection "' + collection.displayName + '" to project "' + projectCode +'"');

	var mainDocument   = _.head(followUpDocuments);
	var otherDocuments = _.tail(followUpDocuments);

	var collectionId = null;

	return addCollection(collection, projectCode).then(function(newCollection) {
		if (newCollection) collectionId = newCollection._id;
		var others = [];
		if (mainDocument && collectionId) {
			// find the actual document ID
			var matches = mainDocument.ref.match('api/document/(.+)/fetch$');
			if (matches) {
				console.log('Adding main document "' + mainDocument.name + '" to collection "' + collection.displayName + '"');
				others.push(addMainDocument(matches[1], collectionId));
			}
		}
		return Promise.all(others);
	}).then(function() {
		var others = [];
		if (collectionId) {
			_.each(otherDocuments, function(otherDocument) {
				// find the actual document ID
				var matches = otherDocument.ref.match('api/document/(.+)/fetch$');
				if (matches) {
					console.log('Adding other document "' + otherDocument.name + '" to collection "' + collection.displayName + '"');
					others.push(addOtherDocument(matches[1], collectionId));
				}
			});
		}
		return Promise.all(others);
	});
}

// --------------
// Authorizations
// --------------

var doAuthorizations = function() {
	var authorizations = require(test ? './test_authorizations.json' : './authorizations.json');

	// Ignore EAO documents
	authorizations = _.filter(authorizations, function(a) { return a.agencyCode !== 'EAO'; });
	console.log('\nAuthorizations to load: ', authorizations.length, '\n');

	var promises = _.map(authorizations, function(authorization) {
		var collection  = {
			displayName : authorization.documentName,
			parentType  : 'Authorizations',
			type        : authorization.documentType + (authorization.documentStatus === 'Amended' ? ' Amendment' : ''),
			status      : authorization.documentStatus || 'Issued',
			date        : authorization.authorizationDate ? authorization.authorizationDate.$date : '',
			isForENV    : authorization.agencyCode === 'ENV',
			isForMEM    : authorization.agencyCode === 'MEM',
		};

		return add(authorization.projectCode, collection, authorization.followUpDocuments);
	});

	return Promise.all(promises);
}

// -----------
// Inspections
// -----------

var doInspections = function() {
	var inspections = require(test ? './test_inspections.json' : './inspections.json');

	// Ignore EAO documents
	inspections = _.filter(inspections, function(i) {
		// The agency code will be the inspection name prefix
		i.agencyCode = i.inspectionName.substr(0, 3);
		return i.agencyCode !== 'EAO';
	});
	console.log('\nInspections to load: ', inspections.length, '\n');

	var promises = _.map(inspections, function(inspection) {
		var collection = {
			displayName : inspection.inspectionNum,
			parentType  : 'Compliance and Enforcement',
			type        : 'Inspection Report',
			status      : 'Issued',
			date        : inspection.inspectionDate ? inspection.inspectionDate.$date : '',
			isForENV    : inspection.agencyCode === 'ENV',
			isForMEM    : inspection.agencyCode === 'MEM',
		};

		return add(inspection.projectCode, collection, inspection.followUpDocuments);
	});

	return Promise.all(promises);
}

// ---------------
// Other Documents
// ---------------

var doOtherDocuments = function() {
	var otherDocuments = require(test ? './test_otherdocuments.json' : './otherdocuments.json');
	console.log('\nOther documents to load: ', otherDocuments.length, '\n');

	var promises = _.map(otherDocuments, function(otherDocument) {
		// The type will be determined from the documentType
		var type = 'Annual Report';
		if (otherDocument.documentType === 'Management Plan') {
			type = 'Management Plan';
		} else if (otherDocument.documentType === 'Annual Dam Safety Inspection (DSI) Report') {
			type = 'Dam Safety Inspection';
		}

		var collection  = {
			displayName : otherDocument.documentName,
			parentType  : 'Other',
			type        : type,
			status      : 'Issued',
			date        : otherDocument.date ? otherDocument.date.$date : '',
			isForENV    : false,
			isForMEM    : true,
		};

		return add(otherDocument.projectCode, collection, otherDocument.documents);
	});

	return Promise.all(promises);
}

// ---
// Run
// ---

doAuthorizations().then(function() {
	return doInspections();
}).then(function() {
	return doOtherDocuments();
});
