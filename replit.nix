{ pkgs }: {
  deps = [
    pkgs.nodejs-18_x
    pkgs.yarn
    pkgs.nodePackages.npm
    pkgs.python3
  ];

  env = {
    LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
      pkgs.stdenv.cc.cc.lib
    ];
  };
}
