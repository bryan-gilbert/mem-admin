'use strict';
angular.module('documents')
	.directive('documentMgrEdit', ['$rootScope', '$modal', '$log', '_', 'moment', 'DocumentMgrService', 'TreeModel', 'CodeLists', function ($rootScope, $modal, $log, _, moment, DocumentMgrService, TreeModel, CodeLists) {
		return {
			restrict: 'A',
			scope: {
				project: '=',
				doc: '=',
				onUpdate: '='
			},
			link: function (scope, element, attrs) {
				element.on('click', function () {
					$modal.open({
						animation: true,
						templateUrl: 'modules/documents/client/views/document-manager-edit.html',
						resolve: {
							obj: function(Document, FolderModel) {
								if (scope.doc._schemaName === "Document") {
									return Document.getModel(scope.doc._id);
								} else {
									return FolderModel.lookup(scope.project._id, scope.doc.model.id);
								}
							}
						},
						controllerAs: 'editFileProperties',
						controller: function ($scope, $modalInstance, DocumentMgrService, TreeModel, ProjectModel, Document, obj, CodeLists, FolderModel, AlertService) {
							var self = this;
							self.busy = true;

							$scope.project = scope.project;

							$scope.dateOptions = {
								showWeeks: false
							};

							$scope.setDefaultSortOrder = function(value) {
								$scope.doc.defaultSortField = value ? value : '';
								$scope.doc.defaultSortDirection = value ? 'desc' : '';
							};

							$scope.originalName = obj.displayName;
							$scope.doc = obj;
							if ($scope.doc._schemaName === "Document") {
								// Only set the filename extension attribute (fn-extension) if there is an extension.
								var parts = $scope.doc.documentFileName.split('.');
								$scope.extension = parts.length > 1 ? parts.pop() : undefined;
							}
							// any dates going to the datepicker need to be javascript Date objects...
							function prepDate(model) { return _.isEmpty(model) ? null : moment(model).toDate();}
							$scope.doc.documentDate = prepDate(obj.documentDate);
							$scope.doc.dateUploaded = prepDate(obj.dateUploaded);
							if ($scope.doc.inspectionReport) {
								$scope.doc.inspectionReport.dateReportIssued 	= prepDate(obj.inspectionReport.dateReportIssued);
								$scope.doc.inspectionReport.dateResponse 	= prepDate(obj.inspectionReport.dateResponse);
								$scope.doc.inspectionReport.dateFollowUp 	= prepDate(obj.inspectionReport.dateFollowUp);
							}

							$scope.datePicker = { opened: false };
							$scope.dateUploadedPicker = {opened: false};
							$scope.dateReportIssuedPicker = {opened: false};
							$scope.dateResponsePicker = {opened: false};
							$scope.dateFollowUpPicker = {opened: false};
							$scope.validate = function() {
								$scope.$broadcast('show-errors-check-validity', 'editFileForm');
							};

							self.canEdit = $scope.doc.userCan.write;

							// Used to remove keywords from the document model
							$scope.removeKeyword = function (keyword) {
								_.remove($scope.doc.keywords, function (word) {
									return word === keyword;
								});
							};

							self.cancel = function () {
								$modalInstance.dismiss('cancel');
							};

							self.save = function (isValid) {
								self.busy = true;
								// should be valid here...
								if (isValid) {
									if ($scope.doc._schemaName === "Document") {
										Document.save($scope.doc)
										.then(function (result) {
											// somewhere here we need to tell document manager to refresh it's document...
											if (scope.onUpdate) {
												scope.onUpdate(result);
											}
											self.busy = false;
											$modalInstance.close(result);
										}, function(error) {
											console.log(error);
											self.busy = false;
										});
									} else {
										// Check if the foldername already exists.
										FolderModel.lookupForProjectIn($scope.project._id, $scope.doc.parentID)
										.then(function (fs) {
											if ($scope.originalName === $scope.doc.displayName) {
												// Skip if we detect the user didn't change the name.
												return FolderModel.save($scope.doc);
											} else {
												var found = null;
												_.each(fs, function (foldersInDirectory) {
													if (foldersInDirectory.displayName === $scope.doc.displayName) {
														found = true;
														return false;
													}
												});
												if (found) {
													return null;
												} else {
													return FolderModel.save($scope.doc);
												}
											}
										})
										.then(function (result) {
											if (result) {
												DocumentMgrService.renameDirectory($scope.project, scope.doc, $scope.doc.displayName)
												.then(function (result) {
													// somewhere here we need to tell document manager to refresh it's document...
													if (scope.onUpdate) {
														scope.onUpdate(result);
													}
													self.busy = false;
													$modalInstance.close(result);
												}, function (err) {
													AlertService.error("Could not rename folder: " + err.data.message);
												});
											} else {
												self.busy = false;
												AlertService.error("Sorry, folder already exists.  Please choose another name.");
											}
										}, function(error) {
											console.log(error);
											self.busy = false;
										});
									}
								}
							};
							self.busy = false;
						}
					});
				});
			}
		};
	}])
;
