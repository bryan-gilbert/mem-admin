'use strict';

angular.module('collections').config(['$stateProvider', function($stateProvider) {
	$stateProvider

	.state('p.collection', {
		abstract: true,
		url: '/collection',
		template: '<ui-view></ui-view>',
		data: { permissions: ['listCollections'] },
		resolve: {
			collections: function($stateParams, CollectionModel, project) {
				return CollectionModel.lookupProject(project.code);
			},
			types: function() {
				var types = ['Inspection Report', 'Permit', 'Permit Amendment', 'Annual Report', 'Management Plan', 'Dam Safety Inspection'];
				return types.map(function(t) {
					return { id: t, title: t };
				});
			},
		}
	})

	.state('p.collection.list', {
		url: '/list',
		templateUrl: 'modules/collections/client/views/collections-list.html',
		controller: function ($scope, NgTableParams, collections, project, types) {
			$scope.tableParams = new NgTableParams({ count: 10 },{ dataset: collections });
			$scope.project = project;
			$scope.types = types;
		}
	})

	.state('p.collection.create', {
		url: '/create',
		templateUrl: 'modules/collections/client/views/collection-edit.html',
		data: { permissions: ['createCollection'] },
		resolve: {
			collection: function(CollectionModel) {
				return CollectionModel.getNew();
			}
		},
		controller: function($scope, $state, project, collection, types, CollectionModel) {
			$scope.collection = collection;
			$scope.collection.project = project._id;
			$scope.project = project;
			$scope.types = types;

			$scope.save = function(isValid) {
				if (!isValid) {
					$scope.$broadcast('show-errors-check-validity', 'collectionForm');
					return false;
				}
				CollectionModel.add($scope.collection)
				.then(function(model) {
					$state.transitionTo('p.collection.detail', { projectid: project.code, collectionId: collection._id }, {
							reload: true, inherit: false, notify: true
					});
				})
				.catch(function(err) {
					console.error(err);
				});
			};
		}
	})

	.state('p.collection.detail', {
		url: '/:collectionId',
		templateUrl: 'modules/collections/client/views/collection-view.html',
		resolve: {
			collection: function($stateParams, CollectionModel) {
				return CollectionModel.getModel($stateParams.collectionId);
			}
		},
		controller: function($scope, $state, $modal, NgTableParams, collection, project, CollectionModel, _) {
			$scope.collection = collection;
			$scope.project = project;

			$scope.mainTableParams = new NgTableParams({ count: 1   }, { dataset: collection.mainDocument ? [ collection.mainDocument ] : [], counts: [] });
			$scope.otherTableParams = new NgTableParams({ sorting: { sortOrder: 'asc' }, count: 10 }, { dataset: collection.otherDocuments });

			$scope.linkedMainDocument = collection.mainDocument ? [ collection.mainDocument.document ] : [];
			$scope.linkedOtherDocuments = _.map(collection.otherDocuments, function(cd) { return cd.document; });

			$scope.showSuccess = function(msg, transitionCallback, title) {
				var modalDocView = $modal.open({
					animation: true,
					templateUrl: 'modules/utils/client/views/partials/modal-success.html',
					controller: function($scope, $state, $modalInstance, _) {
						var self = this;
						self.title = title || 'Success';
						self.msg = msg;
						self.ok = function() {
							$modalInstance.close($scope.org);
						};
						self.cancel = function() {
							$modalInstance.dismiss('cancel');
						};
					},
					controllerAs: 'self',
					scope: $scope,
					size: 'md',
					windowClass: 'modal-alert',
					backdropClass: 'modal-alert-backdrop'
				});
				// do not care how this modal is closed, just go to the desired location...
				modalDocView.result.then(function (res) {transitionCallback(); }, function (err) { transitionCallback(); });
			};

			$scope.showError = function(msg, errorList, transitionCallback, title) {
				var modalDocView = $modal.open({
					animation: true,
					templateUrl: 'modules/utils/client/views/partials/modal-error.html',
					controller: function($scope, $state, $modalInstance, _) {
						var self = this;
						self.title = title || 'An error has occurred';
						self.msg = msg;
						self.ok = function() {
							$modalInstance.close($scope.org);
						};
						self.cancel = function() {
							$modalInstance.dismiss('cancel');
						};
					},
					controllerAs: 'self',
					scope: $scope,
					size: 'md',
					windowClass: 'modal-alert',
					backdropClass: 'modal-alert-backdrop'
				});
				// do not care how this modal is closed, just go to the desired location...
				modalDocView.result.then(function (res) {transitionCallback(); }, function (err) { transitionCallback(); });
			};

			var goToList = function() {
				$state.transitionTo('p.collection.list', { projectid: project.code }, {
						reload: true, inherit: false, notify: true
				});
			};

			var reloadDetails = function() {
				$state.transitionTo('p.collection.detail', { projectid: project.code, collectionId: collection._id }, {
						reload: true, inherit: false, notify: true
				});
			};

			$scope.otherDocsReordered = function() {
				reloadDetails();
			};

			$scope.delete = function() {
				var modalView = $modal.open({
					animation: true,
					templateUrl: 'modules/utils/client/views/partials/modal-confirm-delete.html',
					controller: function($scope, $state, $modalInstance) {
						var self = this;
						self.dialogTitle = "Delete Collection";
						self.name = $scope.collection.displayName;
						self.ok = function() {
							$modalInstance.close($scope.collection);
						};
						self.cancel = function() {
							$modalInstance.dismiss('cancel');
						};
					},
					controllerAs: 'self',
					scope: $scope,
					size: 'md'
				});
				modalView.result.then(function(res) {
					CollectionModel.removeCollection($scope.collection._id)
					.then(function(res) {
						// deleted show the message, and go to list...
						$scope.showSuccess('"'+ $scope.collection.displayName +'"' + ' was deleted successfully.', goToList, 'Delete Success');
					})
					.catch(function(res) {
						console.log("res:", res);
						// could have errors from a delete check...
						var failure = _.has(res, 'message') ? res.message : undefined;
						$scope.showError('"'+ $scope.collection.displayName +'"' + ' was not deleted.', [], reloadDetails, 'Delete Error');
					});
				});
			};

			$scope.goToDocument = function(document) {
				// Open document in doc manager. Perhaps we just need the URL
			};

			$scope.updateMainDocument = function(updatedDocuments) {
				var docPromise = null;

				// Check for updates
				if (collection.mainDocument && (!updatedDocuments || updatedDocuments.length === 0)) {
					// Removed main document
					docPromise = CollectionModel.removeMainDocument(collection._id, collection.mainDocument.document._id);
				} else if (updatedDocuments && updatedDocuments.length > 0) {
					// Only use the first document
					var newMainDocument = updatedDocuments[0];
					if (!collection.mainDocument || collection.mainDocument.document._id !== newMainDocument._id) {
						docPromise = CollectionModel.addMainDocument(collection._id, newMainDocument._id);
					}
				}

				if (docPromise) {
					docPromise
					.then(reloadDetails)
					.catch(function(res) {
						console.log("res:", res);
						var failure = _.has(res, 'message') ? res.message : undefined;
						$scope.showError('Could not update main document for "'+ $scope.collection.displayName +'".', [], reloadDetails, 'Update Main Document Error');
					});
				}
			};

			$scope.removeMainDocument = function(document) {
				CollectionModel.removeMainDocument($scope.collection._id, document._id)
				.then(reloadDetails)
				.catch(function(res) {
					console.log("res:", res);
					var failure = _.has(res, 'message') ? res.message : undefined;
					$scope.showError('Could not remove main document from "'+ $scope.collection.displayName +'".', [], reloadDetails, 'Remove Main Document Error');
				});
			};

			$scope.updateOtherDocuments = function(updatedDocuments) {
				var originalDocuments = _.map(collection.otherDocuments, function(cd) { return cd.document; });

				// Find documents added to the collection
				var addedDocuments = _.filter(updatedDocuments, function(updatedDoc) {
					return !_.find(originalDocuments, function(originalDoc) { return originalDoc._id === updatedDoc._id; });
				});

				// Find documents removed from the collection
				var removedDocuments = _.filter(originalDocuments, function(originalDoc) {
					return !_.find(updatedDocuments, function(updatedDoc) { return updatedDoc._id === originalDoc._id; });
				});

				var docPromises = _.union(_.map(addedDocuments, function(doc) {
					return CollectionModel.addOtherDocument(collection._id, doc._id);
				}), _.map(removedDocuments, function(doc) {
					return CollectionModel.removeOtherDocument(collection._id, doc._id);
				}));

				Promise.all(docPromises)
				.then(reloadDetails)
				.catch(function(res) {
					console.log("res:", res);
					var failure = _.has(res, 'message') ? res.message : undefined;
					$scope.showError('Could not update other documents for "'+ $scope.collection.displayName +'".', [], reloadDetails, 'Update Other Documents Error');
				});
			};

			$scope.removeOtherDocument = function(document) {
				CollectionModel.removeOtherDocument($scope.collection._id, document._id)
				.then(reloadDetails)
				.catch(function(res) {
					console.log("res:", res);
					var failure = _.has(res, 'message') ? res.message : undefined;
					$scope.showError('Could not remove other document from "'+ $scope.collection.displayName +'".', [], reloadDetails, 'Remove Other Document Error');
				});
			};

			$scope.publish = function() {
				CollectionModel.publishCollection($scope.collection._id)
				.then(function(res) {
					// deleted show the message, and go to list...
					$scope.showSuccess('"'+ $scope.collection.displayName +'"' + ' was published successfully.', goToList, 'Publish Success');
				})
				.catch(function(res) {
					console.log("res:", res);
					var failure = _.has(res, 'message') ? res.message : undefined;
					$scope.showError('"'+ $scope.collection.displayName +'"' + ' was not published.', [], reloadDetails, 'Publish Error');
				});
			};

			$scope.unpublish = function() {
				CollectionModel.unpublishCollection($scope.collection._id)
				.then(function(res) {
					// deleted show the message, and go to list...
					$scope.showSuccess('"'+ $scope.collection.displayName +'"' + ' was unpublished successfully.', goToList, 'Unpublish Success');
				})
				.catch(function(res) {
					console.log("res:", res);
					var failure = _.has(res, 'message') ? res.message : undefined;
					$scope.showError('"'+ $scope.collection.displayName +'"' + ' was not unpublished.', [], reloadDetails, 'Unpublish Error');
				});
			};
		}
	})

	.state('p.collection.edit', {
		url: '/:collectionId/edit',
		templateUrl: 'modules/collections/client/views/collection-edit.html',
		data: { permissions: ['createCollection'] },
		resolve: {
			collection: function($stateParams, CollectionModel) {
				return CollectionModel.getModel($stateParams.collectionId);
			}
		},
		controller: function($scope, $state, $modal, collection, project, types, CollectionModel, _) {
			$scope.collection = collection;
			$scope.project = project;
			$scope.types = types;

			$scope.showSuccess = function(msg, transitionCallback, title) {
				var modalDocView = $modal.open({
					animation: true,
					templateUrl: 'modules/utils/client/views/partials/modal-success.html',
					controller: function($scope, $state, $modalInstance, _) {
						var self = this;
						self.title = title || 'Success';
						self.msg = msg;
						self.ok = function() {
							$modalInstance.close($scope.org);
						};
						self.cancel = function() {
							$modalInstance.dismiss('cancel');
						};
					},
					controllerAs: 'self',
					scope: $scope,
					size: 'md',
					windowClass: 'modal-alert',
					backdropClass: 'modal-alert-backdrop'
				});
				// do not care how this modal is closed, just go to the desired location...
				modalDocView.result.then(function (res) {transitionCallback(); }, function (err) { transitionCallback(); });
			};

			$scope.showError = function(msg, errorList, transitionCallback, title) {
				var modalDocView = $modal.open({
					animation: true,
					templateUrl: 'modules/utils/client/views/partials/modal-error.html',
					controller: function($scope, $state, $modalInstance, _) {
						var self = this;
						self.title = title || 'An error has occurred';
						self.msg = msg;
						self.ok = function() {
							$modalInstance.close($scope.org);
						};
						self.cancel = function() {
							$modalInstance.dismiss('cancel');
						};
					},
					controllerAs: 'self',
					scope: $scope,
					size: 'md',
					windowClass: 'modal-alert',
					backdropClass: 'modal-alert-backdrop'
				});
				// do not care how this modal is closed, just go to the desired location...
				modalDocView.result.then(function (res) {transitionCallback(); }, function (err) { transitionCallback(); });
			};

			var goToList = function() {
				$state.transitionTo('p.collection.list', { projectid: project.code }, {
					reload: true, inherit: false, notify: true
				});
			};

			var reloadEdit = function() {
				// want to reload this screen, do not catch unsaved changes (we are probably in the middle of saving).
				$scope.allowTransition = true;
				$state.reload();
			};

			$scope.delete = function() {
				var modalView = $modal.open({
					animation: true,
					templateUrl: 'modules/utils/client/views/partials/modal-confirm-delete.html',
					controller: function($scope, $state, $modalInstance) {
						var self = this;
						self.dialogTitle = "Delete Collection";
						self.name = $scope.collection.displayName;
						self.ok = function() {
							$modalInstance.close($scope.collection);
						};
						self.cancel = function() {
							$modalInstance.dismiss('cancel');
						};
					},
					controllerAs: 'self',
					scope: $scope,
					size: 'md'
				});
				modalView.result.then(function(res) {
					CollectionModel.deleteId($scope.collection._id)
					.then(function(res) {
						// deleted show the message, and go to list...
						$scope.showSuccess('"'+ $scope.collection.displayName +'"' + ' was deleted successfully.', goToList, 'Delete Success');
					})
					.catch(function(res) {
						console.log("res:", res);
						// could have errors from a delete check...
						var failure = _.has(res, 'message') ? res.message : undefined;
						$scope.showError('"'+ $scope.collection.displayName +'"' + ' was not deleted.', [], reloadEdit, 'Delete Error');
					});
				});
			};

			$scope.publish = function() {
				CollectionModel.publishCollection($scope.collection._id)
				.then(function(res) {
					// deleted show the message, and go to list...
					$scope.showSuccess('"'+ $scope.collection.displayName +'"' + ' was published successfully.', goToList, 'Publish Success');
				})
				.catch(function(res) {
					console.log("res:", res);
					var failure = _.has(res, 'message') ? res.message : undefined;
					$scope.showError('"'+ $scope.collection.displayName +'"' + ' was not published.', [], reloadEdit, 'Publish Error');
				});
			};

			$scope.unpublish = function() {
				CollectionModel.unpublishCollection($scope.collection._id)
				.then(function(res) {
					// deleted show the message, and go to list...
					$scope.showSuccess('"'+ $scope.collection.displayName +'"' + ' was unpublished successfully.', goToList, 'Unpublish Success');
				})
				.catch(function(res) {
					console.log("res:", res);
					var failure = _.has(res, 'message') ? res.message : undefined;
					$scope.showError('"'+ $scope.collection.displayName +'"' + ' was not unpublished.', [], reloadEdit, 'Unpublish Error');
				});
			};

			$scope.save = function(isValid) {
				if (!isValid) {
					$scope.$broadcast('show-errors-check-validity', 'collectionForm');
					return false;
				}
				CollectionModel.save($scope.collection)
				.then (function (model) {
					$state.transitionTo('p.collection.detail', { projectid: project.code, collectionId: collection._id }, {
							reload: true, inherit: false, notify: true
					});
				})
				.catch(function(err) {
					console.error(err);
				});
			};
		}
	})

	;
}]);
