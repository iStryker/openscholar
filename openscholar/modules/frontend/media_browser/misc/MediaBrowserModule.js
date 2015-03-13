(function () {
  var rootPath = Drupal.settings.osRestModulePath,
      restPath = Drupal.settings.restBasePath;

  angular.module('mediaBrowser', ['JSPager', 'EntityService', 'os-auth', 'ngSanitize', 'angularFileUpload', 'mediaBrowser.filters'])
  .controller('BrowserCtrl', ['$scope', '$filter', '$http', '$templateCache', 'EntityService', '$sce', '$upload',
      function ($scope, $filter, $http, $templateCache, EntityService, $sce, $upload) {
    var service = new EntityService('files', 'id');
    $scope.files = [];
    $scope.numFiles = 0;
    $scope.templatePath = rootPath;
    $scope.selection = 0;
    $scope.selection_form = '';
    $scope.pane = 'upload';
    $scope.toBeUploaded = [];
    $scope.dupes = [];

    // Watch for changes in file list
    $scope.$on('EntityService.files.add', function (event, files) {
      $scope.files = files;
    });

    $scope.$on('EntityService.files.getAll', function (event, files) {
      $scope.files = files;
      for (var i=0; i<$scope.files.length; i++) {
        $scope.files.preview = $sce.trustAsHtml($scope.files.preview);
      }
      $scope.numFiles = service.getCount();
    });

    $scope.validate = function($file) {
      var file = $file;
      if (file && file instanceof File) {
        // TODO: Get validating properties from somewhere and check the file against them
        return true;
      }
    }

    // looks for any files with a similar basename and extension to this file
    // if it finds any, it adds it to a list of dupes, then scans every file to find what the new name should be
    $scope.checkForDupes = function($files, $event, $rejected) {
      var toBeUploaded = [];
      $scope.dupes = [];
      for (var i=0; i<$files.length; i++) {
        var similar = [],
            basename = $files[i].name.replace(/\.[a-zA-Z0-9]*$/, ''),
            extension = $files[i].name.replace(basename, '');

        for (var j in $scope.files) {
          // find any file with a name that matches "basename{_dd}.ext" and add it to list
          if ($scope.files[j].name.indexOf(basename) !== -1 && $scope.files[j].name.indexOf(extension) !== -1) {
            similar.push($files[i]);
          }
        }

        if (similar.length) {
          // only one similar file found, drop _01 at the end
          if (similar.length == 1) {
            $files[i].newName = basename + '_01' + extension;
          }
          else {
            // lots of them found, look through all of them, find the highest number at the end, and add it
            // to the end of the original file name
            var max = 0;
            for (j=0; j<similar.length; j++) {
              var rem = similar[j].name.replace(basename, '').replace(extension, '').replace('_', ''),
                num = rem ? parseInt(rem) : 0;

              if (rem > max) {
                max = rem;
              };
            }
            var num = max + 1;
            // convert num to a 2 digit string
            num = num < 10 ? '0'+num : num
            // and make the new file name
            $files[i].newName = basename+'_'+num+extension;
          }
          // with the new name complete, we can push this onto the list of dupes
          $scope.dupes.push($files[i]);
        }
        else {
          // not a dupe, just upload it silently
          toBeUploaded.push($files[i]);
        }
      }

      $scope.upload(toBeUploaded);
    }

    // renames the file before uploading
    $scope.rename = function ($index, $last) {
      console.log($index);

      if ($last) {
        finalizeDupes();
      }
    }

    // tells the server to replace the old file on disk with this new one
    // (just performs a swap on the hard drive)
    $scope.replace = function ($index, $last) {
      console.log($index);

      if ($last) {
        finalizeDupes();
      }
    }

    // cancels the upload process for this file
    $scope.cancelUpload = function ($index, $last) {
      $scope.dupes[$index].doNotUpload = true;
      $scope.dupes[$index].processed = true;

      if ($last) {
        finalizeDupes();
      }
    }

    function finalizeDupes() {
      var toBeUploaded = [];
      for (var i in $scope.dupes) {
        if (!$scope.dupes[i].doNotUpload) {
          toBeUploaded.push($scope.dupes[i]);
        }
      }

      $scope.upload(toBeUploaded);
      $scope.dupes = [];
    }

    (function () {
      var toBeUploaded = [],
        uploading = false,
        progress = null,
        currentlyUploading = 0;

      $scope.upload = function ($files) {
        for (var i=0; i<$files.length; i++) {
          toBeUploaded.push($files[i]);
        }

        if (!uploading && toBeUploaded.length) {
          uploading = true;
          $file = toBeUploaded[currentlyUploading];
          uploadOne($file);
        }
      }

      function uploadOne($file) {
        var fields = {};
        if (Drupal.settings.spaces) {
          fields.vsite = Drupal.settings.spaces.id;
        }
        $upload.upload({
          url: Drupal.settings.paths.api+'/files',
          file: $file,
          data: $file,
          fileFormDataName: 'files[upload]',
          headers: {'Content-Type': $file.type},
          method: 'POST',
          fields: fields,
          fileName: $file.newName || null
        }).progress(function (e) {
          progress = e;
        }).success(function (e) {
          for (var i = 0; i< e.data.length; i++) {
            $scope.files[e.data[i].id] = e.data[i];
          }

          currentlyUploading++;
          if (currentlyUploading < toBeUploaded.length) {
            $file = toBeUploaded[currentlyUploading];
            uploadOne($file);
          }
          else {
            toBeUploaded = [];
            uploading = false;
            progress = null;
            currentlyUploading = 0;
          }
        });
      }

      $scope.uploadProgress = function () {
        return {
          uploading: uploading,
          filename: uploading ? toBeUploaded[currentlyUploading].name : '',
          progressBar: (uploading && progress) ? parseInt(100.0 * progress.loaded / progress.total) : 0,
          index: currentlyUploading+1,
          numFiles: toBeUploaded.length
        }
      }
    })();


    // selected file
    $scope.setSelection = function (fid) {
      $scope.selection = fid;
      $scope.selected_file = angular.copy(service.get(fid));
      switch ($scope.selected_file.type) {
        case 'image':
          $scope.selection_form = rootPath+'/templates/file_edit_image.html';
          break;
        default:
          $scope.selection_form = rootPath+'/templates/file_edit_default.html';
      }
    };

    // preload file edit templates
    $http.get(rootPath+'/templates/file_edit_default.html', {cache:$templateCache});
    $http.get(rootPath+'/templates/file_edit_image.html', {cache:$templateCache});

    // file edit form methods
    $scope.save = function() {
      service.edit($scope.selected_file);
    };

    $scope.deleteConfirmed = function() {
      service.delete($scope.selected_file);
    };


    $scope.embedSubmit = function () {

    }
  }]);
})();