//intitle:"141108"&&(intitle:bestie||intitle:???)
Groups = new Mongo.Collection("groups");
Videos = new Mongo.Collection("videos");
Selected = new Mongo.Collection(null);
VideosOnDisplay = new Mongo.Collection(null);

if (Meteor.isClient) {
  analytics.page('home');
    var dateRange = [];
    fromDate = 100000,
        toDate = 200000;

    (function(){
      try{
        var url = window.location.href.split('/');
        url = url[url.length-1];
        url = decodeURIComponent(url);
        if(url.length > 1){
          url = url.split("#")[0];
          var groups = url.split("?groups=")[1];
          fromDate = parseInt(url.split("?fromDate=")[1].split("&")[0]);
          toDate = parseInt(url.split("?toDate=")[1].split("&")[0]);

          _.each(groups.split(","), function(group){
            Selected.upsert({groupName: group}, {groupName: group});
          });
        }
      }
      catch(e){}
    })();

    var generateDateRange = function () {

        var yy = 110, mm = 0, dd = 00,
            yyy = new Date().getYear(),
            mmm = new Date().getMonth() + 1,
            ddd = new Date().getDate();

        while (yy != yyy || mm != mmm || dd != ddd) {
            dd++;
            if (dd >= 32) {
                dd = 0;
                mm++;
            }
            if (mm >= 13) {
                mm = 0;
                yy++;
            }
            dateRange.push(("0" + yy).slice(-2) + ("0" + mm).slice(-2) + ("0" + dd).slice(-2));
        }
    }
    generateDateRange();

    updateVideoListForBand = function (bandName) {
        var band = Groups.findOne({englishName: bandName});
        _.each(dateRange, function (dateString) {
            var queryString = 'intitle:"' + dateString + '"&&(intitle:' + band.englishName + '||intitle:' + band.koreanName + ')';
            searchVideos(queryString, function (items) {
                $.each(items, function (index, item) {
                  console.log(dateString + "/" + index);
                    Videos.upsert({_id: item.id.videoId}, {
                        $set: {
                            videoUrl: "https://www.youtube.com/watch?v="+ item.id.videoId,
                            title: item.snippet.title,
                            thumbnail: item.snippet.thumbnails.default.url,
                            bandEnglishName: band.englishName,
                            performanceDate: parseInt(dateString),
                            formatedDate: dateString.slice(2, 4) + "/" + dateString.slice(4, 6) + "/20" + dateString.slice(0, 2)
                        }
                    });
                });
            });
        });
    }

    searchVideos = function (query, callback) {
        var request = gapi.client.youtube.search.list({
            part: "snippet",
            type: "video",
            q: query,
            order: "relevance",
            maxResults: 50
        });

        // execute the request
        request.execute(function (response) {
            if (response.result.items.length != 0)
                callback(response.result.items);
        });
    }

    //-----------------------------------------------------------------------------------------------------
    Template.home.helpers({
        videoIndexCount:function(){
          return Videos.find().fetch().length || 0;
        },

        groups: function () {
            return Groups.find().fetch();
        },
        videos: function () {
            var selectedGroups = [];

            _.each(Selected.find().fetch(), function (group) {
                selectedGroups.push(group.groupName);
            });
            a = Videos.find(
                {
                    'bandEnglishName': {$in: selectedGroups},
                    'performanceDate': {$gte: fromDate, $lt: toDate}
                },
                {
                    sort: {performanceDate: -1}
                }
            ).fetch();

            _.each(a, function(b){
              var curThumb = b.thumbnail;
              b.thumbnail = curThumb.replace("default.jpg", "hqdefault.jpg");
            })
            return a;
        },
        selected: function () {
            var selected = Selected.find().fetch();
            _.each(selected, function (group) {
              group.groupName = "[" + group.groupName + "]";
            })
            return selected;
        }
    });

    var updateUrlUI = function(){
      var groups = Selected.find().fetch();
      var url = "/?fromDate="+fromDate+"&?toDate="+toDate+"&?groups="
      var groupsJoined = [];
      _.each(groups, function(group){
        groupsJoined.push(group.groupName);
      });
      window.history.pushState('', '', url + groupsJoined.join());
    }

    Template.body.events({
        "click .refreshDate": function (event) {
            fromDate = $('#from_date').val();
            fromDate = parseInt(fromDate.slice(8, 10) + fromDate.slice(0, 2) + fromDate.slice(3, 5));
            toDate = $('#to_date').val();
            toDate = parseInt(toDate.slice(8, 10) + toDate.slice(0, 2) + toDate.slice(3, 5));
            Selected.insert({groupName: "Date"});
            Selected.remove({groupName: "Date"});

            updateUrlUI();
        },

        "click .groupsList": function (event) {

          console.log("event");
            //event.preventDefault();
            var groupName = event.target.text.trim();
            Selected.upsert({groupName: groupName}, {groupName: groupName});

            updateUrlUI();
            //updateVideoListForBand(groupName);
        },
        "click .selected": function (event) {
            //event.preventDefault();
            console.log($(event.target).text());
            var groupName = event.target.text.split('[')[1].split(']')[0];
            Selected.remove({groupName: groupName});

            updateUrlUI();
        }
    });

    getNewGroupData = function () {
        Meteor.call('getGroupData');
    }

    function sleep(milliseconds) {
      var start = new Date().getTime();
      for (var i = 0; i < 1e7; i++) {
        if ((new Date().getTime() - start) > milliseconds){
          break;
        }
      }
    }

    getUpdatedVideos = function(){
      var groups = Groups.find().fetch();
      _.each(groups, function(group){
        console.log("Updating " + group.englishName);
        updateVideoListForBand(group.englishName);
        sleep(20000);
      });
    }
}

//-----------------------------------------------------------------------------------------------------

if (Meteor.isServer) {
    Meteor.startup(function () {
        //Videos.remove({});
        Meteor.methods({
            getGroupData: function () {
                console.log("Getting new data");
                Groups.remove({});
                var cheerio = Meteor.npmRequire("cheerio");
                var kpopwikilink = "https://en.wikipedia.org/wiki/Category:South_Korean_girl_groups";

                var results = Meteor.http.get(kpopwikilink);
                $ = cheerio.load(results.content);

                var body = $(".mw-category-group > ul > li > a");

                _.each(body, function (item) {
                    var groupNameEnglish = item.attribs.title;
                    var groupNameKorean;
                    var members = [];

                    var bandUrl = 'https://en.wikipedia.org' + item.attribs.href;
                    results = Meteor.http.get(bandUrl);
                    $ = cheerio.load(results.content);

                    var memberLinks = $("th:contains('Members')").next().find('li > a');
                    groupNameKorean = $("[lang = ko-Hang], [lang = ko]").first().text();

                    _.each(memberLinks, function (item2) {
                        var memberWiki = 'https://en.wikipedia.org' + item2.attribs.href;
                        var memberEnglishName = item2.attribs.title;

                        results = Meteor.http.get(memberWiki);
                        $ = cheerio.load(results.content);

                        var memberKoreanName = $("a:contains('Hangul')").closest("th").next().text();

                        members.push({
                            englishName: memberEnglishName,
                            koreanName: memberKoreanName || "N/A",
                            wikiLink: memberWiki || "N/A"
                        });

                    });

                    Groups.upsert({
                            englishName: groupNameEnglish
                        },
                        {
                            englishName: groupNameEnglish,
                            koreanName: groupNameKorean,
                            bandWikiLink: bandUrl,
                            members: members,
                            lastUpdated: Date.now()
                        }
                    );

                })

            }
        })
        //getGroupData();
        //   console.log(Groups);
    });
}
