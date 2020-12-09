function getPhotos() {
    query = $('#search-input').val();
    if ($.trim(query) == '') {
        return false;
    }
    $('#search-input').val(null);
    sdk.searchGet({'q': encodeURIComponent(query)}, {}, {})
        .then((response)=>{
            console.log(response)
            var data = response.data;
            if (data.results) {
                var photos = data.results;
                $('.gallery').empty();
                for (photo of photos) {
                    var $newphoto = $("<img src='"+photo.url+"'>");
                    $('.gallery').append($newphoto);
                }
            }
        });
}

function uploadPhoto() {
    const reader = new FileReader();  
    var filename = $('#upload-img').val().split('\\').pop();
    var imgFiles = $('#upload-img').prop('files');
    if(imgFiles.length > 0) {
        imgFile=imgFiles[0];
        reader.onload = function(e) {
            img_bin = e.target.result.replace(/^data:image\/(png|jpg|jpeg);base64,/, '');
            sdk.uploadKeyPut({'key': filename, 'Content-Type': 'application/json'}, img_bin, {});
            $('#upload-img').val('');
        };
        reader.readAsDataURL(imgFile);
    }
}

$('#submit-query').click(function() {
    getPhotos();
});

$('#submit-upload').click(function() {
    uploadPhoto();
});